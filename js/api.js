/* =========================================================
   가짜 API 계층
   - 화면은 반드시 이 Api 객체를 통해서만 데이터를 읽고 쓴다.
   - 백엔드 개발 시 각 함수를 fetch('/api/...') 호출로 바꾸면 된다.
   - 서버에서 지켜야 할 규칙(중복 입주 방지, 원자적 거래, 결제 금액 검증 등)을
     여기서 흉내 내어 프런트 흐름을 검토할 수 있게 했다.
   ========================================================= */

class ApiError extends Error {
  constructor(code, message, extra) { super(message); this.code = code; this.extra = extra; }
}

const LIMITS = {
  messageMax: 500,
  messagesPerMinute: 5,
  friendRequestsPerHour: 10,
  reRequestAfterRejectMs: 24 * 60 * 60 * 1000,
};

const Api = (() => {
  const db = () => Store.db;
  const wait = (ms = 220) => new Promise(r => setTimeout(r, ms + Math.random() * 120));
  const commit = () => { Store.save(); Bus.emit('data'); };

  function me() {
    const s = Store.getSession();
    if (!s) return null;
    const u = db().users.find(x => x.id === s.userId);
    if (!u || u.status !== 'active') return null;
    return u;
  }
  function requireMe() {
    const u = me();
    if (!u) throw new ApiError('UNAUTHORIZED', '로그인이 필요해요.');
    return u;
  }
  async function hash(pw) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mongle:' + pw));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // 비보안 컨텍스트 대비 (데모 전용)
      let h = 0; for (const c of 'mongle:' + pw) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h;
    }
  }
  const nick = id => (db().profiles[id] || {}).nickname || '알 수 없는 이웃';
  const isBlockedBetween = (a, b) => db().blocks.some(x => (x.by === a && x.target === b) || (x.by === b && x.target === a));
  const isFriend = (a, b) => db().friendships.some(f => f.status === 'accepted' && ((f.from === a && f.to === b) || (f.from === b && f.to === a)));
  const homeOf = userId => db().homes.find(h => h.occupant === userId) || null;

  /* ---------- 재화 원장 ---------- */
  function balance(userId) {
    let paid = 0, free = 0;
    db().walletTx.forEach(t => { if (t.userId === userId) { paid += t.paid; free += t.free; } });
    return { paid, free, total: paid + free };
  }
  function addTx(userId, type, paid, free, extra = {}) {
    const tx = { id: uid('tx_'), userId, type, paid, free, at: now(), ...extra };
    db().walletTx.push(tx);
    return tx;
  }

  /* ---------- 공개 프로필 ---------- */
  function publicProfile(userId, viewerId) {
    const u = db().users.find(x => x.id === userId);
    const p = db().profiles[userId];
    if (!u || !p) return null;
    const self = userId === viewerId;
    const home = homeOf(userId);
    const out = {
      id: userId,
      nickname: u.status === 'withdrawn' ? '떠난 이웃' : p.nickname,
      bio: (self || p.bioPublic) ? p.bio : null,
      home: home ? homeInfo(home.id) : null,
      npc: !!u.npc,
      msgFrom: p.msgFrom,
    };
    if (self || p.friendsPublic) {
      out.friends = db().friendships.filter(f => f.status === 'accepted' && (f.from === userId || f.to === userId))
        .map(f => nick(f.from === userId ? f.to : f.from));
    }
    if (viewerId && !self) {
      out.relation = relation(viewerId, userId);
    }
    return out;
  }
  function relation(a, b) {
    if (db().blocks.some(x => x.by === a && x.target === b)) return 'blocked';
    if (isFriend(a, b)) return 'friend';
    if (db().friendships.some(f => f.status === 'pending' && f.from === a && f.to === b)) return 'sent';
    if (db().friendships.some(f => f.status === 'pending' && f.from === b && f.to === a)) return 'received';
    return 'none';
  }

  /* ---------- 이웃(NPC) 반응 시뮬레이션 ---------- */
  function npcReact(kind, npcId, myId) {
    const u = db().users.find(x => x.id === npcId);
    if (!u || !u.npc) return;
    if (kind === 'friend') {
      setTimeout(() => {
        const f = db().friendships.find(x => x.status === 'pending' && x.from === myId && x.to === npcId);
        if (!f) return;
        f.status = 'accepted'; f.respondedAt = now();
        commit();
        Bus.emit('notify', { icon: 'friends', text: `${nick(npcId)}님이 친구 요청을 수락했어요!` });
      }, 2500);
    }
    if (kind === 'message') {
      setTimeout(() => {
        if (isBlockedBetween(myId, npcId)) return;
        const body = NPC_REPLIES[Math.floor(Math.random() * NPC_REPLIES.length)];
        db().messages.push({ id: uid('msg_'), from: npcId, to: myId, body, at: now(), readAt: null, delBySender: false, delByRecipient: false });
        commit();
        Bus.emit('notify', { icon: 'mail', text: `${nick(npcId)}님에게서 새 쪽지가 도착했어요.` });
      }, 4000);
    }
  }

  function grantStarter(userId) {
    const inst = STARTER.items.map(itemId => {
      const ui = { id: uid('ui_'), userId, itemId, acquiredAt: now(), source: 'starter' };
      db().userItems.push(ui);
      return ui;
    });
    addTx(userId, 'event', 0, STARTER.freeCoins, { reason: '첫 입주 환영 선물' });
    db().layouts[userId] = { wallpaper: STARTER.wallpaper, floor: STARTER.floor, placed: [], savedAt: now() };
    // 환영 쪽지와 친구 요청 (데모용 이웃 반응)
    db().messages.push({ id: uid('msg_'), from: 'npc_somsatang', to: userId, body: '몽글마을에 온 걸 환영해요, 이웃님!\n천천히 둘러보고 마음에 드는 집을 골라보세요. 궁금한 게 있으면 언제든 쪽지 주세요 :)', at: now(), readAt: null, delBySender: false, delByRecipient: false });
    db().friendships.push({ id: uid('fr_'), from: 'npc_gureum', to: userId, status: 'pending', at: now(), respondedAt: null });
    db().likes.push({ userId: 'npc_somsatang', ownerId: userId, at: now() });
    return inst;
  }

  return {
    LIMITS,
    me,
    nick,
    balanceSync: () => { const u = me(); return u ? balance(u.id) : { paid: 0, free: 0, total: 0 }; },

    /* ===================== 계정 ===================== */
    async checkNickname(nickname) {
      await wait(150);
      const n = nickname.trim();
      if (n.length < 2 || n.length > 10) throw new ApiError('INVALID', '닉네임은 2~10자로 지어주세요.');
      if (!/^[가-힣a-zA-Z0-9_]+$/.test(n)) throw new ApiError('INVALID', '한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요.');
      const taken = Object.values(db().profiles).some(p => p.nickname === n);
      return { available: !taken };
    },
    async signup({ email, password, nickname, minor, guardianEmail }) {
      await wait(400);
      email = email.trim().toLowerCase();
      if (db().users.some(u => u.email === email && u.status !== 'withdrawn')) {
        throw new ApiError('EMAIL_TAKEN', '이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요.');
      }
      if (Object.values(db().profiles).some(p => p.nickname === nickname)) {
        throw new ApiError('NICK_TAKEN', '방금 다른 이웃이 이 닉네임을 가져갔어요. 다른 닉네임을 골라주세요.');
      }
      const user = {
        id: uid('u_'), email, pwHash: await hash(password), status: 'active', verified: false,
        minor: !!minor, guardianEmail: minor ? guardianEmail : null, guardianConsent: false,
        createdAt: now(), role: 'user',
      };
      db().users.push(user);
      db().profiles[user.id] = { nickname, bio: '', bioPublic: true, friendsPublic: false, msgFrom: 'all' };
      grantStarter(user.id);
      commit();
      return { userId: user.id, email };
    },
    async verifyEmail(email) {
      await wait(300);
      const u = db().users.find(x => x.email === email.trim().toLowerCase() && x.status === 'active');
      if (!u) throw new ApiError('NOT_FOUND', '인증할 계정을 찾지 못했어요.');
      u.verified = true;
      if (u.minor) u.guardianConsent = true; // 데모: 보호자 인증도 함께 완료 처리
      commit();
      return true;
    },
    async login({ email, password, keep }) {
      await wait(350);
      const u = db().users.find(x => x.email === email.trim().toLowerCase() && !x.npc && x.status !== 'withdrawn');
      if (!u || u.pwHash !== await hash(password)) {
        throw new ApiError('BAD_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요. 대소문자와 Caps Lock을 확인해 주세요.');
      }
      if (u.status === 'suspended') throw new ApiError('SUSPENDED', '운영 정책에 따라 이용이 제한된 계정이에요. 고객센터로 문의해 주세요.');
      if (!u.verified) throw new ApiError('NOT_VERIFIED', '아직 이메일 인증이 끝나지 않았어요.', { email: u.email });
      Store.setSession(u.id, keep);
      return { userId: u.id };
    },
    async guestLogin() {
      await wait(300);
      const n = Math.floor(Math.random() * 9000 + 1000);
      const email = `guest${n}@demo.mongle`;
      const nickname = '새싹' + n;
      const user = { id: uid('u_'), email, pwHash: await hash('guest-' + n), status: 'active', verified: true, createdAt: now(), role: 'user', guest: true };
      db().users.push(user);
      db().profiles[user.id] = { nickname, bio: '', bioPublic: true, friendsPublic: false, msgFrom: 'all' };
      grantStarter(user.id);
      commit();
      Store.setSession(user.id, true);
      return { userId: user.id };
    },
    logout() { Store.clearSession(); Bus.emit('data'); },
    async requestPasswordReset(email) {
      await wait(300);
      // 계정 존재 여부와 관계없이 같은 응답 (계정 탐색 방지)
      const u = db().users.find(x => x.email === email.trim().toLowerCase() && !x.npc && x.status !== 'withdrawn');
      return { sent: true, demoToken: u ? u.id : null };
    },
    async resetPassword(token, password) {
      await wait(300);
      const u = db().users.find(x => x.id === token);
      if (!u) throw new ApiError('INVALID_TOKEN', '재설정 링크가 만료되었어요. 다시 요청해 주세요.');
      u.pwHash = await hash(password);
      commit();
      return true;
    },
    async withdraw(password) {
      await wait(400);
      const u = requireMe();
      if (!u.guest && u.pwHash !== await hash(password)) throw new ApiError('BAD_CREDENTIALS', '비밀번호가 맞지 않아요.');
      const home = homeOf(u.id);
      if (home) {
        home.occupant = null;
        const r = db().residences.find(x => x.userId === u.id && !x.movedOutAt);
        if (r) r.movedOutAt = now();
      }
      db().friendships = db().friendships.filter(f => f.from !== u.id && f.to !== u.id);
      db().likes = db().likes.filter(l => l.userId !== u.id && l.ownerId !== u.id);
      u.status = 'withdrawn';
      u.withdrawnAt = now();
      u.email = `withdrawn_${u.id}`; // 개인정보 분리 보관 정책 자리
      Store.clearSession();
      commit();
      return true;
    },

    /* ===================== 프로필 ===================== */
    getProfile(userId) { const m = me(); return publicProfile(userId || (m && m.id), m && m.id); },
    myAccount() {
      const u = requireMe();
      return { ...u, pwHash: undefined, profile: { ...db().profiles[u.id] }, home: homeOf(u.id) ? homeInfo(homeOf(u.id).id) : null, balance: balance(u.id) };
    },
    async updateProfile(patch) {
      await wait(250);
      const u = requireMe();
      const p = db().profiles[u.id];
      if (patch.nickname !== undefined && patch.nickname !== p.nickname) {
        const n = patch.nickname.trim();
        if (n.length < 2 || n.length > 10) throw new ApiError('INVALID', '닉네임은 2~10자로 지어주세요.');
        if (Object.entries(db().profiles).some(([id, x]) => id !== u.id && x.nickname === n)) throw new ApiError('NICK_TAKEN', '이미 다른 이웃이 쓰고 있는 닉네임이에요.');
        p.nickname = n;
      }
      if (patch.bio !== undefined) {
        if (patch.bio.length > 80) throw new ApiError('INVALID', '소개는 80자까지 쓸 수 있어요.');
        p.bio = patch.bio;
      }
      ['bioPublic', 'friendsPublic'].forEach(k => { if (patch[k] !== undefined) p[k] = !!patch[k]; });
      if (patch.msgFrom && ['all', 'friends', 'none'].includes(patch.msgFrom)) p.msgFrom = patch.msgFrom;
      commit();
      return { ...p };
    },

    /* ===================== 마을 / 주거 ===================== */
    async getVillage() {
      await wait(200);
      const m = me();
      return db().homes.map(h => {
        const info = homeInfo(h.id);
        const occ = h.occupant ? db().users.find(u => u.id === h.occupant) : null;
        return {
          ...info,
          available: h.available,
          occupantId: h.occupant,
          occupantName: occ ? nick(occ.id) : null,
          mine: m ? h.occupant === m.id : false,
        };
      });
    },
    async getHomeDetail(homeId) {
      await wait(150);
      const h = db().homes.find(x => x.id === homeId);
      if (!h) throw new ApiError('NOT_FOUND', '없는 집이에요.');
      const m = me();
      return {
        ...homeInfo(homeId),
        available: h.available,
        occupied: !!h.occupant,
        mine: m && h.occupant === m.id,
        resident: h.occupant ? publicProfile(h.occupant, m && m.id) : null,
      };
    },
    /* 입주와 이사는 같은 원자적 처리: 빈집 확인 → 이전 집 비우기 → 새 집 점유 */
    async moveTo(homeId) {
      await wait(450);
      const u = requireMe();
      const target = db().homes.find(x => x.id === homeId);
      if (!target) throw new ApiError('NOT_FOUND', '없는 집이에요.');
      if (!target.available) throw new ApiError('UNAVAILABLE', '지금은 입주할 수 없는 집이에요.');
      if (target.occupant === u.id) throw new ApiError('SAME_HOME', '이미 살고 있는 집이에요.');
      if (target.occupant) throw new ApiError('ALREADY_OCCUPIED', '아쉽게도 방금 다른 이웃이 먼저 입주했어요. 다른 빈집을 골라주세요.');
      const prev = homeOf(u.id);
      if (prev) {
        prev.occupant = null;
        const r = db().residences.find(x => x.userId === u.id && !x.movedOutAt);
        if (r) r.movedOutAt = now();
      }
      target.occupant = u.id;
      db().residences.push({ id: uid('res_'), userId: u.id, homeId, movedInAt: now(), movedOutAt: null });
      commit();
      return { home: homeInfo(homeId), moved: !!prev, from: prev ? homeInfo(prev.id) : null };
    },

    /* ===================== 방 / 보관함 ===================== */
    async getRoom(userId) {
      await wait(200);
      const m = me();
      const owner = userId || (m && m.id);
      const layout = db().layouts[owner];
      if (!layout) throw new ApiError('NOT_FOUND', '방 정보를 찾을 수 없어요.');
      const instMap = Object.fromEntries(db().userItems.filter(x => x.userId === owner).map(x => [x.id, x]));
      return {
        ownerId: owner,
        readOnly: !m || owner !== m.id,
        wallpaper: layout.wallpaper,
        floor: layout.floor,
        placed: layout.placed.filter(p => instMap[p.instId]).map(p => ({ ...p, itemId: instMap[p.instId].itemId })),
        savedAt: layout.savedAt,
      };
    },
    async getInventory() {
      await wait(120);
      const u = requireMe();
      return db().userItems.filter(x => x.userId === u.id).map(x => ({ ...x }));
    },
    async saveRoom({ wallpaper, floor, placed }) {
      await wait(350);
      const u = requireMe();
      const owned = db().userItems.filter(x => x.userId === u.id);
      const ownedIds = new Set(owned.map(x => x.id));
      const ownedItemIds = new Set(owned.map(x => x.itemId));
      // 서버 검증: 보유하지 않은 아이템 / 같은 인스턴스 중복 배치 / 범위
      const seen = new Set();
      for (const p of placed) {
        if (!ownedIds.has(p.instId)) throw new ApiError('NOT_OWNED', '가지고 있지 않은 가구가 포함되어 있어요.');
        if (seen.has(p.instId)) throw new ApiError('DUPLICATE', '같은 가구를 두 곳에 놓을 수 없어요.');
        seen.add(p.instId);
        if (p.x < -1 || p.x > 101 || p.y < -1 || p.y > 101) throw new ApiError('OUT_OF_BOUNDS', '방 밖으로 나간 가구가 있어요.');
      }
      if (!ownedItemIds.has(wallpaper) || !ownedItemIds.has(floor)) throw new ApiError('NOT_OWNED', '가지고 있지 않은 벽지나 바닥이에요.');
      db().layouts[u.id] = {
        wallpaper, floor,
        placed: placed.map(p => ({ instId: p.instId, x: +p.x.toFixed(2), y: +p.y.toFixed(2), rot: p.rot, flip: !!p.flip, z: p.z })),
        savedAt: now(),
      };
      commit();
      return { savedAt: db().layouts[u.id].savedAt };
    },

    /* ===================== 방 좋아요 ===================== */
    roomLikes(ownerId) {
      const m = me();
      const list = db().likes.filter(l => l.ownerId === ownerId);
      return {
        count: list.length,
        liked: !!m && list.some(l => l.userId === m.id),
        likers: list.slice().sort((a, b) => b.at.localeCompare(a.at)).map(l => ({ id: l.userId, nickname: nick(l.userId), at: l.at })),
      };
    },
    /* 누를 때마다 좋아요 ↔ 취소. 내 방, 차단 관계에서는 누를 수 없음 */
    async toggleLike(ownerId) {
      await wait(150);
      const u = requireMe();
      if (ownerId === u.id) throw new ApiError('INVALID', '내 방에는 좋아요를 누를 수 없어요.');
      if (!db().layouts[ownerId]) throw new ApiError('NOT_FOUND', '방을 찾을 수 없어요.');
      if (isBlockedBetween(u.id, ownerId)) throw new ApiError('BLOCKED', '지금은 이 방에 좋아요를 누를 수 없어요.');
      const i = db().likes.findIndex(l => l.userId === u.id && l.ownerId === ownerId);
      if (i >= 0) db().likes.splice(i, 1);
      else db().likes.push({ userId: u.id, ownerId, at: now() });
      commit();
      return Api.roomLikes(ownerId);
    },

    /* ===================== 친구 ===================== */
    async getFriends() {
      await wait(180);
      const u = requireMe();
      const fs = db().friendships;
      const map = f => ({ id: f.id, at: f.at, other: publicProfile(f.from === u.id ? f.to : f.from, u.id) });
      return {
        friends: fs.filter(f => f.status === 'accepted' && (f.from === u.id || f.to === u.id)).map(map),
        received: fs.filter(f => f.status === 'pending' && f.to === u.id).map(map),
        sent: fs.filter(f => f.status === 'pending' && f.from === u.id).map(map),
        blocked: db().blocks.filter(b => b.by === u.id).map(b => ({ id: b.target, at: b.at, nickname: nick(b.target) })),
      };
    },
    async sendFriendRequest(toId) {
      await wait(250);
      const u = requireMe();
      if (toId === u.id) throw new ApiError('INVALID', '나에게는 친구 요청을 보낼 수 없어요.');
      if (isBlockedBetween(u.id, toId)) throw new ApiError('BLOCKED', '지금은 이 이웃에게 친구 요청을 보낼 수 없어요.');
      if (isFriend(u.id, toId)) throw new ApiError('ALREADY', '이미 친구예요.');
      const fs = db().friendships;
      if (fs.some(f => f.status === 'pending' && f.from === u.id && f.to === toId)) throw new ApiError('DUPLICATE', '이미 요청을 보냈어요. 이웃의 답을 기다려 주세요.');
      const incoming = fs.find(f => f.status === 'pending' && f.from === toId && f.to === u.id);
      if (incoming) { // 상대가 이미 요청했다면 바로 친구
        incoming.status = 'accepted'; incoming.respondedAt = now(); commit();
        return { status: 'accepted' };
      }
      const rejected = fs.find(f => f.status === 'rejected' && f.from === u.id && f.to === toId);
      if (rejected && Date.now() - new Date(rejected.respondedAt).getTime() < LIMITS.reRequestAfterRejectMs) {
        throw new ApiError('TOO_SOON', '거절된 요청은 하루가 지난 뒤 다시 보낼 수 있어요.');
      }
      const hourAgo = Date.now() - 3600e3;
      if (fs.filter(f => f.from === u.id && new Date(f.at).getTime() > hourAgo).length >= LIMITS.friendRequestsPerHour) {
        throw new ApiError('RATE_LIMIT', '친구 요청을 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요.');
      }
      db().friendships = fs.filter(f => !(f.from === u.id && f.to === toId && f.status === 'rejected'));
      db().friendships.push({ id: uid('fr_'), from: u.id, to: toId, status: 'pending', at: now(), respondedAt: null });
      commit();
      npcReact('friend', toId, u.id);
      return { status: 'pending' };
    },
    async respondFriend(requestId, accept) {
      await wait(200);
      const u = requireMe();
      const f = db().friendships.find(x => x.id === requestId && x.to === u.id && x.status === 'pending');
      if (!f) throw new ApiError('NOT_FOUND', '이미 처리된 요청이에요.');
      f.status = accept ? 'accepted' : 'rejected';
      f.respondedAt = now();
      commit();
      return f.status;
    },
    async cancelFriendRequest(requestId) {
      await wait(150);
      const u = requireMe();
      db().friendships = db().friendships.filter(x => !(x.id === requestId && x.from === u.id && x.status === 'pending'));
      commit();
    },
    async removeFriend(otherId) {
      await wait(200);
      const u = requireMe();
      db().friendships = db().friendships.filter(f => !(f.status === 'accepted' && ((f.from === u.id && f.to === otherId) || (f.from === otherId && f.to === u.id))));
      commit();
    },
    async block(targetId) {
      await wait(200);
      const u = requireMe();
      if (targetId === u.id) throw new ApiError('INVALID', '나를 차단할 수는 없어요.');
      if (!db().blocks.some(b => b.by === u.id && b.target === targetId)) {
        db().blocks.push({ by: u.id, target: targetId, at: now() });
      }
      // 차단 시 친구 관계와 대기 중인 요청 정리
      db().friendships = db().friendships.filter(f => !((f.from === u.id && f.to === targetId) || (f.from === targetId && f.to === u.id)));
      commit();
    },
    async unblock(targetId) {
      await wait(150);
      const u = requireMe();
      db().blocks = db().blocks.filter(b => !(b.by === u.id && b.target === targetId));
      commit();
    },

    /* ===================== 쪽지 ===================== */
    async getMessages(box) {
      await wait(180);
      const u = requireMe();
      const list = db().messages.filter(m => box === 'sent'
        ? m.from === u.id && !m.delBySender
        : m.to === u.id && !m.delByRecipient && !db().blocks.some(b => b.by === u.id && b.target === m.from));
      return list.slice().sort((a, b) => b.at.localeCompare(a.at)).map(m => ({
        ...m, fromName: nick(m.from), toName: nick(m.to),
      }));
    },
    unreadCount() {
      const u = me();
      if (!u) return 0;
      return db().messages.filter(m => m.to === u.id && !m.readAt && !m.delByRecipient && !db().blocks.some(b => b.by === u.id && b.target === m.from)).length;
    },
    pendingFriendCount() {
      const u = me();
      if (!u) return 0;
      return db().friendships.filter(f => f.status === 'pending' && f.to === u.id).length;
    },
    async markRead(messageId) {
      const u = requireMe();
      const m = db().messages.find(x => x.id === messageId);
      if (m && m.to === u.id && !m.readAt) { m.readAt = now(); commit(); }
    },
    async sendMessage(toId, body) {
      await wait(300);
      const u = requireMe();
      body = (body || '').trim();
      if (!body) throw new ApiError('EMPTY', '안부를 한 글자 이상 적어주세요.');
      if (body.length > LIMITS.messageMax) throw new ApiError('TOO_LONG', `쪽지는 ${LIMITS.messageMax}자까지 쓸 수 있어요.`);
      if (toId === u.id) throw new ApiError('INVALID', '나에게는 쪽지를 보낼 수 없어요.');
      const target = db().users.find(x => x.id === toId && x.status === 'active');
      if (!target) throw new ApiError('NOT_FOUND', '쪽지를 받을 수 없는 이웃이에요.');
      if (isBlockedBetween(u.id, toId)) throw new ApiError('BLOCKED', '지금은 이 이웃에게 쪽지를 보낼 수 없어요.');
      const pref = db().profiles[toId].msgFrom;
      if (pref === 'none') throw new ApiError('CLOSED', `${nick(toId)}님은 지금 쪽지를 받지 않고 있어요.`);
      if (pref === 'friends' && !isFriend(u.id, toId)) throw new ApiError('FRIENDS_ONLY', `${nick(toId)}님은 친구에게서만 쪽지를 받아요. 먼저 친구 요청을 보내보세요.`);
      const minAgo = Date.now() - 60e3;
      if (db().messages.filter(m => m.from === u.id && new Date(m.at).getTime() > minAgo).length >= LIMITS.messagesPerMinute) {
        throw new ApiError('RATE_LIMIT', '쪽지를 너무 빨리 보내고 있어요. 1분 뒤에 다시 보내주세요.');
      }
      const msg = { id: uid('msg_'), from: u.id, to: toId, body, at: now(), readAt: null, delBySender: false, delByRecipient: false };
      db().messages.push(msg);
      commit();
      npcReact('message', toId, u.id);
      return msg;
    },
    /* 기본 정책: 본인 화면에서만 삭제 */
    async deleteMessage(messageId) {
      await wait(150);
      const u = requireMe();
      const m = db().messages.find(x => x.id === messageId);
      if (!m) return;
      if (m.from === u.id) m.delBySender = true;
      if (m.to === u.id) m.delByRecipient = true;
      commit();
    },
    async report({ messageId, targetId, reason, detail }) {
      await wait(250);
      const u = requireMe();
      if (db().reports.some(r => r.reporter === u.id && r.messageId === messageId && messageId)) {
        throw new ApiError('DUPLICATE', '이미 신고한 쪽지예요. 운영팀이 확인 중이에요.');
      }
      const msg = messageId ? db().messages.find(m => m.id === messageId) : null;
      db().reports.push({ id: uid('rp_'), reporter: u.id, targetId, messageId: messageId || null, snapshot: msg ? msg.body : null, reason, detail: detail || '', status: 'open', at: now() });
      commit();
    },
    async messageTargets() {
      await wait(100);
      const u = requireMe();
      return db().users.filter(x => x.id !== u.id && x.status === 'active' && !isBlockedBetween(u.id, x.id))
        .map(x => ({ id: x.id, nickname: nick(x.id), friend: isFriend(u.id, x.id), msgFrom: db().profiles[x.id].msgFrom }))
        .sort((a, b) => (b.friend - a.friend) || a.nickname.localeCompare(b.nickname));
    },

    /* ===================== 상점 ===================== */
    async getShop() {
      await wait(180);
      const u = requireMe();
      const counts = {};
      db().userItems.filter(x => x.userId === u.id).forEach(x => { counts[x.itemId] = (counts[x.itemId] || 0) + 1; });
      return allItems().filter(i => i.price > 0 || !STARTER.items.includes(i.id)).map(i => ({ ...i, owned: counts[i.id] || 0 }));
    },
    /*
      구매: 잔액 확인 → 재화 차감 + 아이템 지급을 한 번에 처리
      idemKey 로 같은 요청이 두 번 와도 한 번만 처리 (새로고침·연타 방지)
    */
    async buyItem(itemId, idemKey) {
      await wait(500);
      const u = requireMe();
      const key = `buy:${u.id}:${idemKey}`;
      if (db().idempotency[key]) return { ...db().idempotency[key], replayed: true };
      const item = getItem(itemId);
      if (!item || !item.sale) throw new ApiError('NOT_FOR_SALE', '지금은 판매하지 않는 아이템이에요.');
      if (!item.stack && db().userItems.some(x => x.userId === u.id && x.itemId === itemId)) {
        throw new ApiError('ALREADY_OWNED', '이미 가지고 있는 아이템이에요. 이 아이템은 하나만 가질 수 있어요.');
      }
      const bal = balance(u.id);
      if (bal.total < item.price) throw new ApiError('INSUFFICIENT', '몽글이 부족해요.', { need: item.price - bal.total });
      // 무료 재화 먼저 사용
      const useFree = Math.min(bal.free, item.price);
      const usePaid = item.price - useFree;
      const inst = { id: uid('ui_'), userId: u.id, itemId, acquiredAt: now(), source: 'purchase' };
      const purchase = { id: uid('pur_'), userId: u.id, itemId, price: item.price, instId: inst.id, at: now() };
      db().userItems.push(inst);
      db().purchases.push(purchase);
      addTx(u.id, 'purchase', -usePaid, -useFree, { ref: purchase.id, reason: `${item.name} 구매` });
      const result = { purchaseId: purchase.id, instId: inst.id, balance: balance(u.id) };
      db().idempotency[key] = result;
      commit();
      return result;
    },
    async getHistory() {
      await wait(150);
      const u = requireMe();
      return {
        tx: db().walletTx.filter(t => t.userId === u.id).slice().reverse(),
        orders: db().orders.filter(o => o.userId === u.id).slice().reverse(),
      };
    },

    /* ===================== 충전 / 결제 (토스페이먼츠 흐름 모사) ===================== */
    async getProducts() {
      await wait(120);
      return db().products.filter(p => p.sale).map(p => ({ ...p }));
    },
    /* 1) 서버가 주문을 만든다 — 금액은 서버의 상품표 기준 */
    async createOrder(productId) {
      await wait(300);
      const u = requireMe();
      const p = db().products.find(x => x.id === productId && x.sale);
      if (!p) throw new ApiError('NOT_FOUND', '판매 중인 충전 상품이 아니에요.');
      if (u.minor && !u.guardianConsent) throw new ApiError('GUARDIAN_REQUIRED', '보호자 동의가 확인된 뒤에 충전할 수 있어요.');
      const order = {
        orderId: 'MONGLE-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        userId: u.id, productId: p.id, productName: p.name, amount: p.price, coins: p.coins,
        status: 'READY', paymentKey: null, method: null, granted: false, createdAt: now(),
      };
      db().orders.push(order);
      db().paymentAudit.push({ at: now(), orderId: order.orderId, event: 'ORDER_CREATED', detail: `${p.name} ${p.price}원` });
      commit();
      return { orderId: order.orderId, amount: order.amount, orderName: p.name, coins: p.coins };
    },
    /* 2) 결제창 실패/취소 */
    async failOrder(orderId, code, message) {
      await wait(150);
      const o = db().orders.find(x => x.orderId === orderId);
      if (o && o.status === 'READY') {
        o.status = code === 'USER_CANCEL' ? 'CANCELED' : 'FAILED';
        o.failReason = message;
        db().paymentAudit.push({ at: now(), orderId, event: 'PAYMENT_' + o.status, detail: `${code} ${message}` });
        commit();
      }
    },
    /* 3) 서버 결제 승인 — 주문번호·금액 검증 후 1회만 재화 지급 */
    async confirmPayment({ orderId, paymentKey, amount, method }) {
      await wait(700);
      const u = requireMe();
      const o = db().orders.find(x => x.orderId === orderId && x.userId === u.id);
      const audit = (event, detail) => db().paymentAudit.push({ at: now(), orderId, event, detail });
      if (!o) throw new ApiError('NOT_FOUND', '주문 정보를 찾지 못했어요.');
      if (o.status === 'DONE') {
        audit('DUPLICATE_CONFIRM', '이미 승인된 주문에 승인 재요청'); commit();
        throw new ApiError('ALREADY_PROCESSED', '이미 처리된 결제예요. 몽글은 한 번만 지급돼요.');
      }
      if (o.status !== 'READY') throw new ApiError('INVALID_STATE', '진행할 수 없는 주문이에요.');
      if (Number(amount) !== o.amount) {
        o.status = 'FAILED'; o.failReason = '결제 금액 불일치';
        audit('AMOUNT_MISMATCH', `요청 ${amount} / 주문 ${o.amount}`); commit();
        throw new ApiError('AMOUNT_MISMATCH', '결제 금액이 주문과 달라 결제를 진행하지 않았어요.');
      }
      // (실서비스) 여기서 시크릿 키로 토스페이먼츠 승인 API 호출
      o.status = 'DONE'; o.paymentKey = paymentKey; o.method = method; o.approvedAt = now();
      audit('PAYMENT_APPROVED', `${o.amount}원 ${method}`);
      if (!o.granted) {
        o.granted = true;
        addTx(u.id, 'charge', o.coins, 0, { orderId, reason: `${o.productName} 충전` });
        audit('COINS_GRANTED', `${o.coins}몽글`);
      }
      commit();
      return { order: { ...o }, balance: balance(u.id) };
    },

    /* ===================== 관리자 (데모: 로그인한 누구나 접근) ===================== */
    admin: {
      overview() {
        const d = db();
        return {
          users: d.users.filter(x => !x.npc).length,
          active: d.users.filter(x => !x.npc && x.status === 'active').length,
          residents: d.homes.filter(h => h.occupant).length,
          homes: d.homes.length,
          openReports: d.reports.filter(r => r.status === 'open').length,
          revenue: d.orders.filter(o => o.status === 'DONE').reduce((s, o) => s + o.amount, 0),
          messages: d.messages.length,
        };
      },
      users() {
        return db().users.map(u => ({
          id: u.id, email: u.email, nickname: nick(u.id), status: u.status, npc: !!u.npc, guest: !!u.guest, minor: !!u.minor,
          createdAt: u.createdAt, home: homeOf(u.id) ? homeInfo(homeOf(u.id).id).name : '-', balance: balance(u.id).total,
        }));
      },
      setUserStatus(userId, status) {
        const u = db().users.find(x => x.id === userId);
        if (!u || u.status === 'withdrawn') return;
        u.status = status;
        db().adminLog.push({ at: now(), actor: me() && me().id, action: 'USER_STATUS', target: userId, detail: status });
        commit();
      },
      reports() {
        return db().reports.slice().reverse().map(r => ({ ...r, reporterName: nick(r.reporter), targetName: nick(r.targetId) }));
      },
      resolveReport(id, status, note) {
        const r = db().reports.find(x => x.id === id);
        if (!r) return;
        r.status = status; r.note = note; r.resolvedAt = now();
        db().adminLog.push({ at: now(), actor: me() && me().id, action: 'REPORT_' + status.toUpperCase(), target: id, detail: note || '' });
        commit();
      },
      items() { return allItems(); },
      updateItem(id, patch) {
        const m = db().itemMeta[id];
        if (!m) return;
        if (patch.price !== undefined) m.price = Math.max(0, Math.round(+patch.price || 0));
        if (patch.sale !== undefined) m.sale = !!patch.sale;
        db().adminLog.push({ at: now(), actor: me() && me().id, action: 'ITEM_UPDATE', target: id, detail: JSON.stringify(patch) });
        commit();
      },
      products() { return db().products.map(p => ({ ...p })); },
      updateProduct(id, patch) {
        const p = db().products.find(x => x.id === id);
        if (!p) return;
        if (patch.price !== undefined) p.price = Math.max(100, Math.round(+patch.price || 0));
        if (patch.coins !== undefined) p.coins = Math.max(1, Math.round(+patch.coins || 0));
        if (patch.sale !== undefined) p.sale = !!patch.sale;
        db().adminLog.push({ at: now(), actor: me() && me().id, action: 'PRODUCT_UPDATE', target: id, detail: JSON.stringify(patch) });
        commit();
      },
      orders() { return db().orders.slice().reverse().map(o => ({ ...o, nickname: nick(o.userId) })); },
      audit() { return db().paymentAudit.slice().reverse(); },
      /* 환불: 결제 취소 + 재화 회수. 이미 사용한 유료 재화가 있으면 거절 */
      refund(orderId, reason) {
        const o = db().orders.find(x => x.orderId === orderId);
        if (!o || o.status !== 'DONE') throw new ApiError('INVALID_STATE', '승인 완료된 주문만 환불할 수 있어요.');
        const bal = balance(o.userId);
        if (bal.paid < o.coins) throw new ApiError('COINS_USED', `이미 사용한 유료 몽글이 있어 자동 환불할 수 없어요. (보유 유료 ${bal.paid} / 회수 필요 ${o.coins})`);
        o.status = 'REFUNDED'; o.refundedAt = now(); o.refundReason = reason;
        addTx(o.userId, 'refund', -o.coins, 0, { orderId, reason: '환불 회수: ' + reason, actor: me() && me().id });
        db().paymentAudit.push({ at: now(), orderId, event: 'REFUNDED', detail: reason });
        commit();
      },
      ledger() { return db().walletTx.slice().reverse().map(t => ({ ...t, nickname: nick(t.userId) })); },
      adjust(userId, amount, reason) {
        amount = Math.round(+amount);
        if (!amount) throw new ApiError('INVALID', '조정할 수량을 입력해 주세요.');
        if (!reason || !reason.trim()) throw new ApiError('INVALID', '조정 사유는 꼭 남겨야 해요.');
        const bal = balance(userId);
        if (amount < 0 && bal.free + amount < 0) throw new ApiError('INVALID', '회수량이 무료 재화 잔액보다 많아요.');
        addTx(userId, 'admin', 0, amount, { reason: reason.trim(), actor: me() && me().id });
        commit();
      },
      homes() {
        return db().homes.map(h => ({ ...homeInfo(h.id), occupant: h.occupant ? nick(h.occupant) : null, available: h.available }));
      },
      setHomeAvailable(id, available) {
        const h = db().homes.find(x => x.id === id);
        if (!h) return;
        h.available = !!available;
        commit();
      },
    },
  };
})();

/* 아주 작은 이벤트 버스 */
const Bus = {
  handlers: {},
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return () => this.off(ev, fn); },
  off(ev, fn) { this.handlers[ev] = (this.handlers[ev] || []).filter(f => f !== fn); },
  emit(ev, data) { (this.handlers[ev] || []).slice().forEach(f => { try { f(data); } catch (e) { console.error(e); } }); },
};
