/* =========================================================
   로컬 목업 저장소 (localStorage)
   실제 서비스에서는 PostgreSQL 테이블로 대체된다.
   테이블 이름은 PRD 9.1 데이터 모델을 따른다.
   ========================================================= */

const DB_KEY = 'mongle_db_v1';
const SESSION_KEY = 'mongle_session_v1';
const PREF_KEY = 'mongle_prefs_v1';

const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();

const safeStorage = {
  get(storage, key) { try { return storage.getItem(key); } catch { return null; } },
  set(storage, key, v) { try { storage.setItem(key, v); } catch { /* 저장 불가 환경 */ } },
  remove(storage, key) { try { storage.removeItem(key); } catch { /* noop */ } },
};

function seedDB() {
  const db = {
    version: 1,
    users: [],            // 사용자 ID, 이메일, 비밀번호 해시, 계정 상태
    profiles: {},         // 닉네임, 소개, 공개 설정
    homes: HOMES.map(h => ({ id: h.id, occupant: null, available: true })),
    residences: [],       // 입주·퇴거 기록
    friendships: [],      // 요청자, 대상자, 상태
    blocks: [],           // 차단 관계
    messages: [],         // 쪽지
    itemMeta: Object.fromEntries(ITEMS.map(i => [i.id, { price: i.price, sale: true }])),
    userItems: [],        // 아이템 인스턴스
    layouts: {},          // room_layouts (계정 단위 저장 → 이사 후에도 유지)
    walletTx: [],         // wallet_transactions (원장)
    purchases: [],        // 아이템 구매 기록
    products: CHARGE_PRODUCTS.map(p => ({ ...p, sale: true })),
    orders: [],           // payment_orders
    paymentAudit: [],     // 결제 감사 로그
    reports: [],          // 신고
    adminLog: [],         // 관리자 변경 기록
    idempotency: {},      // 중복 요청 방지 키
  };

  // 이웃 시드
  NEIGHBORS.forEach(n => {
    db.users.push({ id: n.id, email: `${n.id}@mongle.town`, pwHash: null, status: 'active', verified: true, npc: true, createdAt: now() });
    db.profiles[n.id] = { nickname: n.nickname, bio: n.bio, bioPublic: n.bioPublic, friendsPublic: false, msgFrom: n.msgFrom };
    const home = db.homes.find(h => h.id === n.home);
    home.occupant = n.id;
    db.residences.push({ id: uid('res_'), userId: n.id, homeId: n.home, movedInAt: now(), movedOutAt: null });
    const placed = n.layout.placed.map(([itemId, x, y], i) => {
      const inst = { id: uid('ui_'), userId: n.id, itemId, acquiredAt: now(), source: 'seed' };
      db.userItems.push(inst);
      return { instId: inst.id, x, y, rot: 0, flip: false, z: i + 1 };
    });
    db.layouts[n.id] = { wallpaper: n.layout.wallpaper, floor: n.layout.floor, placed, savedAt: now() };
  });
  db.likes = seedLikes();
  return db;
}

/* room_likes: 누가(userId) 누구의 방(ownerId)을 좋아하는지. 한 사람당 한 방에 1번 */
function seedLikes() {
  const ids = NEIGHBORS.map(n => n.id);
  const likes = [];
  ids.forEach((owner, i) => {
    ids.filter(x => x !== owner).slice(0, (i * 2) % 5 + 1).forEach(userId => likes.push({ userId, ownerId: owner, at: now() }));
  });
  return likes;
}

const Store = {
  db: null,
  load() {
    const raw = safeStorage.get(localStorage, DB_KEY);
    if (raw) {
      try { this.db = JSON.parse(raw); } catch { this.db = null; }
    }
    if (!this.db || this.db.version !== 1) {
      this.db = seedDB();
      this.save();
    }
    if (!this.db.likes) { this.db.likes = seedLikes(); this.save(); } // 좋아요 기능 이전 데이터 보정
  },
  save() { safeStorage.set(localStorage, DB_KEY, JSON.stringify(this.db)); },
  reset() {
    safeStorage.remove(localStorage, DB_KEY);
    safeStorage.remove(localStorage, SESSION_KEY);
    safeStorage.remove(sessionStorage, SESSION_KEY);
    this.db = seedDB();
    this.save();
  },

  /* 세션: 로그인 유지 체크 시 localStorage, 아니면 sessionStorage */
  getSession() {
    const raw = safeStorage.get(localStorage, SESSION_KEY) || safeStorage.get(sessionStorage, SESSION_KEY);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  setSession(userId, keep) {
    const v = JSON.stringify({ userId, at: now() });
    safeStorage.remove(localStorage, SESSION_KEY);
    safeStorage.remove(sessionStorage, SESSION_KEY);
    safeStorage.set(keep ? localStorage : sessionStorage, SESSION_KEY, v);
  },
  clearSession() {
    safeStorage.remove(localStorage, SESSION_KEY);
    safeStorage.remove(sessionStorage, SESSION_KEY);
  },

  /* 화면 설정(기기별) */
  getPrefs() {
    try { return JSON.parse(safeStorage.get(localStorage, PREF_KEY)) || {}; } catch { return {}; }
  },
  setPrefs(p) { safeStorage.set(localStorage, PREF_KEY, JSON.stringify({ ...this.getPrefs(), ...p })); },
};

/* 카탈로그 + 관리자 수정 값 병합 */
function getItem(id) {
  const base = ITEMS.find(i => i.id === id);
  if (!base) return null;
  const meta = (Store.db && Store.db.itemMeta[id]) || {};
  return { ...base, ...meta };
}
function allItems() { return ITEMS.map(i => getItem(i.id)); }
function homeInfo(id) { return HOMES.find(h => h.id === id); }
