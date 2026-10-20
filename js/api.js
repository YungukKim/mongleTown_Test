/* =========================================================
   API 계층 (Supabase)
   - 화면은 이 Api 객체만 호출한다.
   - 데이터 변경은 모두 DB의 security definer 함수(RPC)로 하고,
     게임 규칙(중복 입주·중복 결제 방지 등)은 서버에서 검사한다.
   - 결제 승인·환불은 Edge Function(toss-payments)이 시크릿 키로 처리한다.
   ========================================================= */

class ApiError extends Error {
  constructor(code, message, extra) { super(message); this.code = code; this.extra = extra; }
}

/* 아주 작은 이벤트 버스 */
const Bus = {
  handlers: {},
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return () => this.off(ev, fn); },
  off(ev, fn) { this.handlers[ev] = (this.handlers[ev] || []).filter(f => f !== fn); },
  emit(ev, data) { (this.handlers[ev] || []).slice().forEach(f => { try { f(data); } catch (e) { console.error(e); } }); },
};

const LIMITS = { messageMax: 500 };
const KEEP_KEY = 'mongle_keep_login';

/* '로그인 상태 유지'를 끄면 세션을 sessionStorage 에만 둔다 */
const authStorage = {
  keep() { return safeStorage.get(localStorage, KEEP_KEY) !== '0'; },
  getItem(k) { return safeStorage.get(sessionStorage, k) ?? safeStorage.get(localStorage, k); },
  setItem(k, v) {
    safeStorage.remove(localStorage, k); safeStorage.remove(sessionStorage, k);
    safeStorage.set(this.keep() ? localStorage : sessionStorage, k, v);
  },
  removeItem(k) { safeStorage.remove(localStorage, k); safeStorage.remove(sessionStorage, k); },
};

const Api = (() => {
  let sb = null;
  let account = null;      // my_account() 캐시
  let firstLoad = true;

  const appUrl = (q = '') => location.origin + location.pathname + q;

  /* DB 오류 'CODE|문장' → ApiError */
  function toApiError(e) {
    if (e instanceof ApiError) return e;
    const msg = (e && e.message) || '';
    const i = msg.indexOf('|');
    if (i > 0) return new ApiError(msg.slice(0, i), msg.slice(i + 1));
    if (/fetch|network/i.test(msg)) return new ApiError('NETWORK', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    console.error(e);
    return new ApiError('SERVER_ERROR', '잠시 문제가 생겼어요. 다시 시도해 주세요.');
  }
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw toApiError(error);
    return data;
  }

  async function loadAccount() {
    const prev = account;
    try {
      account = await rpc('my_account');
    } catch (e) {
      account = null;
      if (['WITHDRAWN', 'SUSPENDED', 'UNAUTHORIZED'].includes(e.code)) await sb.auth.signOut();
      throw e;
    }
    if (prev && !firstLoad) {
      if (account.unread > prev.unread) Bus.emit('notify', { icon: 'mail', text: '새 쪽지가 도착했어요.' });
      if (account.pendingFriends > prev.pendingFriends) Bus.emit('notify', { icon: 'friends', text: '새 친구 요청이 왔어요.' });
    }
    firstLoad = false;
    return account;
  }
  /* 데이터가 바뀐 뒤 계정 요약(잔액·배지)을 다시 받아 화면에 알린다 */
  async function refresh() {
    if (!account) return;
    try { await loadAccount(); } catch { /* 세션 만료 등은 라우터가 처리 */ }
    Bus.emit('data');
  }
  const after = async (p) => { const r = await p; await refresh(); return r; };

  async function loadItemMeta() {
    const { data } = await sb.from('items').select('id, price, sale, stack');
    (data || []).forEach(i => { Store.itemMeta[i.id] = { price: i.price, sale: i.sale, stack: i.stack }; });
  }

  async function invokeFn(body) {
    const { data, error } = await sb.functions.invoke('toss-payments', { body });
    if (!error) return data;
    let info = null;
    try { info = await error.context.json(); } catch { /* 본문 없음 */ }
    if (info && info.code) throw new ApiError(info.code, info.message);
    throw toApiError(error);
  }

  return {
    LIMITS,
    get client() { return sb; },

    /* 앱 시작: 클라이언트 생성 → (이메일 링크로 왔다면 세션 교환) → 계정 요약 불러오기 */
    async init() {
      if (!window.supabase) throw new ApiError('CONFIG', 'Supabase 라이브러리를 불러오지 못했어요.');
      sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, storage: authStorage },
      });
      sb.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') Bus.emit('recovery');
        if (event === 'SIGNED_OUT') { account = null; Bus.emit('data'); }
      });
      await loadItemMeta().catch(() => {});
      const { data: { session } } = await sb.auth.getSession();
      if (session) await loadAccount().catch(() => {});
    },
    refresh,

    /* ---------- 캐시에서 바로 읽는 값 ---------- */
    me() { return account ? { id: account.id } : null; },
    myAccount() { return account; },
    unreadCount() { return account ? account.unread : 0; },
    pendingFriendCount() { return account ? account.pendingFriends : 0; },
    balanceSync() { return account ? account.balance : { paid: 0, free: 0, total: 0 }; },

    /* ===================== 계정 ===================== */
    async checkNickname(nickname) {
      const n = nickname.trim();
      if (n.length < 2 || n.length > 10) throw new ApiError('INVALID', '닉네임은 2~10자로 지어주세요.');
      if (!/^[가-힣a-zA-Z0-9_]+$/.test(n)) throw new ApiError('INVALID', '한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요.');
      return { available: await rpc('nickname_available', { p_nickname: n }) };
    },
    async signup({ email, password, nickname, minor, guardianEmail }) {
      const { data, error } = await sb.auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { data: { nickname, minor: !!minor, guardian_email: minor ? guardianEmail : '' }, emailRedirectTo: appUrl('?auth=verified') },
      });
      if (error) {
        if (/registered|exists/i.test(error.message)) throw new ApiError('EMAIL_TAKEN', '이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요.');
        if (/password/i.test(error.message)) throw new ApiError('WEAK_PASSWORD', '비밀번호가 너무 약해요. 영문·숫자를 섞어 8자 이상으로 만들어 주세요.');
        if (/rate limit/i.test(error.message)) throw new ApiError('RATE_LIMIT', '인증 메일을 너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.');
        throw toApiError(error);
      }
      // 이메일 확인이 켜져 있으면 이미 가입된 주소도 성공처럼 오지만 identities 가 비어 있다
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new ApiError('EMAIL_TAKEN', '이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요.');
      }
      if (data.session) { await loadAccount(); return { needsVerify: false }; }
      return { needsVerify: true };
    },
    async resendVerification(email) {
      const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl('?auth=verified') } });
      if (error) throw new ApiError('RESEND', /rate limit|seconds/i.test(error.message) ? '조금 뒤에 다시 보내주세요.' : '인증 메일을 보내지 못했어요.');
    },
    async login({ email, password, keep }) {
      safeStorage.set(localStorage, KEEP_KEY, keep ? '1' : '0');
      const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        if (/not confirmed/i.test(error.message)) throw new ApiError('NOT_VERIFIED', '아직 이메일 인증이 끝나지 않았어요.', { email: email.trim().toLowerCase() });
        if (/invalid/i.test(error.message)) throw new ApiError('BAD_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요. 대소문자와 Caps Lock을 확인해 주세요.');
        throw toApiError(error);
      }
      firstLoad = true;
      await loadAccount();
      return { userId: account.id };
    },
    /* 체험 계정 = Supabase 익명 로그인 */
    async guestLogin() {
      safeStorage.set(localStorage, KEEP_KEY, '1');
      const { error } = await sb.auth.signInAnonymously();
      if (error) {
        if (/disabled/i.test(error.message)) throw new ApiError('GUEST_DISABLED', '체험 계정이 아직 켜져 있지 않아요. (Supabase 대시보드에서 익명 로그인을 켜야 해요)');
        throw toApiError(error);
      }
      firstLoad = true;
      await loadAccount();
      return { userId: account.id };
    },
    async logout() { await sb.auth.signOut(); account = null; Bus.emit('data'); },
    async requestPasswordReset(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: appUrl('?auth=recovery') });
      if (error && /rate limit|seconds/i.test(error.message)) throw new ApiError('RATE_LIMIT', '조금 뒤에 다시 요청해 주세요.');
      return { sent: true }; // 계정 존재 여부는 알려주지 않는다
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new ApiError('PASSWORD', /different|same/i.test(error.message) ? '이전과 다른 비밀번호로 정해주세요.' : '비밀번호를 바꾸지 못했어요. 재설정 링크를 다시 받아주세요.');
      await loadAccount().catch(() => {});
    },
    async withdraw(password) {
      if (!account.guest) {
        const { error } = await sb.auth.signInWithPassword({ email: account.email, password });
        if (error) throw new ApiError('BAD_CREDENTIALS', '비밀번호가 맞지 않아요.');
      }
      await rpc('withdraw');
      await sb.auth.signOut();
      account = null;
    },

    /* ===================== 프로필 ===================== */
    getProfile(userId) { return rpc('get_profile', { p_user: userId }); },
    async updateProfile(patch) {
      account = await rpc('update_profile', { p: patch });
      Bus.emit('data');
      return account.profile;
    },

    /* ===================== 마을 / 주거 ===================== */
    async getVillage() {
      const rows = await rpc('get_village');
      const byId = Object.fromEntries(rows.map(r => [r.id, r]));
      return HOMES.map(h => ({ ...h, ...(byId[h.id] || {}) }));
    },
    async getHomeDetail(homeId) { return { ...homeInfo(homeId), ...(await rpc('get_home_detail', { p_home: homeId })) }; },
    moveTo(homeId) { return after(rpc('move_to', { p_home: homeId })); },

    /* ===================== 방 ===================== */
    getRoom(ownerId) { return rpc('get_room', { p_owner: ownerId || null }); },
    getInventory() { return rpc('get_inventory'); },
    saveRoom({ wallpaper, floor, placed }) {
      return rpc('save_room', {
        p_wallpaper: wallpaper, p_floor: floor,
        p_placed: placed.map(p => ({ instId: p.instId, x: p.x, y: p.y, rot: p.rot || 0, flip: !!p.flip, z: p.z })),
      });
    },
    roomLikes(ownerId) { return rpc('room_likes', { p_owner: ownerId }); },
    toggleLike(ownerId) { return rpc('toggle_like', { p_owner: ownerId }); },

    /* ===================== 친구 ===================== */
    getFriends() { return rpc('get_friends'); },
    sendFriendRequest(toId) { return after(rpc('send_friend_request', { p_to: toId })); },
    respondFriend(id, accept) { return after(rpc('respond_friend', { p_id: id, p_accept: accept })); },
    cancelFriendRequest(id) { return after(rpc('cancel_friend_request', { p_id: id })); },
    removeFriend(otherId) { return after(rpc('remove_friend', { p_other: otherId })); },
    block(targetId) { return after(rpc('block_user', { p_target: targetId })); },
    unblock(targetId) { return after(rpc('unblock_user', { p_target: targetId })); },

    /* ===================== 쪽지 ===================== */
    getMessages(box) { return rpc('get_messages', { p_box: box }); },
    markRead(id) { return after(rpc('mark_read', { p_id: id })); },
    async sendMessage(toId, body) {
      const r = await rpc('send_message', { p_to: toId, p_body: body });
      setTimeout(refresh, 5000); // 데모 이웃의 답장 확인
      return r;
    },
    deleteMessage(id) { return after(rpc('delete_message', { p_id: id })); },
    report({ messageId, targetId, reason, detail }) {
      return rpc('report_user', { p_target: targetId, p_message: messageId || null, p_reason: reason, p_detail: detail || '' });
    },
    messageTargets() { return rpc('message_targets'); },

    /* ===================== 상점 ===================== */
    async getShop() {
      const rows = await rpc('get_shop');
      rows.forEach(r => { Store.itemMeta[r.id] = { price: r.price, sale: r.sale, stack: r.stack }; });
      return rows.map(r => ({ ...getItem(r.id), owned: r.owned })).filter(i => i.id && ITEMS.some(x => x.id === i.id));
    },
    buyItem(itemId, idemKey) { return after(rpc('buy_item', { p_item: itemId, p_idem_key: idemKey })); },
    getHistory() { return rpc('get_history'); },

    /* ===================== 충전 / 결제 ===================== */
    async getProducts() {
      const { data, error } = await sb.from('charge_products').select('id, name, price, coins').eq('sale', true).order('sort');
      if (error) throw toApiError(error);
      return data;
    },
    createOrder(productId) { return rpc('create_order', { p_product: productId }); },
    failOrder(orderId, code, message) { return rpc('fail_order', { p_order: orderId, p_code: code || 'FAILED', p_message: message || '' }).catch(() => {}); },
    /* 결제위젯 successUrl 로 돌아온 뒤 서버 승인 */
    confirmPayment({ orderId, paymentKey, amount }) {
      return after(invokeFn({ action: 'confirm', orderId, paymentKey, amount: Number(amount) }));
    },
    tossClientKey: () => CONFIG.TOSS_CLIENT_KEY,
    paymentUrls: () => ({ successUrl: appUrl('?pay=success'), failUrl: appUrl('?pay=fail') }),

    /* ===================== 관리자 (DB에서 role=admin 확인) ===================== */
    admin: {
      overview: () => rpc('admin_overview'),
      users: () => rpc('admin_users'),
      setUserStatus: (id, status) => rpc('admin_set_user_status', { p_user: id, p_status: status }),
      setGuardianConsent: (id, v) => rpc('admin_set_guardian_consent', { p_user: id, p_consent: v }),
      reports: () => rpc('admin_reports'),
      resolveReport: (id, status, note) => rpc('admin_resolve_report', { p_id: id, p_status: status, p_note: note }),
      async items() { await loadItemMeta(); return allItems(); },
      updateItem: (id, p) => rpc('admin_update_item', { p_id: id, p_price: Math.round(+p.price || 0), p_sale: !!p.sale }),
      products: () => rpc('admin_products'),
      updateProduct: (id, p) => rpc('admin_update_product', { p_id: id, p_price: Math.round(+p.price || 0), p_coins: Math.round(+p.coins || 0), p_sale: !!p.sale }),
      orders: () => rpc('admin_orders'),
      audit: () => rpc('admin_audit'),
      refund: (orderId, reason) => after(invokeFn({ action: 'cancel', orderId, reason })),
      ledger: () => rpc('admin_ledger'),
      adjust: (id, amount, reason) => rpc('admin_adjust', { p_user: id, p_amount: Math.round(+amount || 0), p_reason: reason }),
      homes: () => rpc('admin_homes'),
      setHomeAvailable: (id, v) => rpc('admin_set_home_available', { p_id: id, p_available: !!v }),
    },
  };
})();
