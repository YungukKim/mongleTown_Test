/* =========================================================
   브라우저 쪽 작은 저장소
   - 화면 설정(움직임 줄이기)처럼 기기별로만 기억할 값
   - 서버에서 받아온 아이템 가격·판매 여부 캐시
   실제 데이터는 Supabase에 있다.
   ========================================================= */

const PREF_KEY = 'mongle_prefs_v1';

const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const safeStorage = {
  get(storage, key) { try { return storage.getItem(key); } catch { return null; } },
  set(storage, key, v) { try { storage.setItem(key, v); } catch { /* 저장 불가 환경 */ } },
  remove(storage, key) { try { storage.removeItem(key); } catch { /* noop */ } },
};

const Store = {
  /* 서버 items 테이블의 가격·판매 여부 (Api.init / getShop 에서 채움) */
  itemMeta: {},

  getPrefs() {
    try { return JSON.parse(safeStorage.get(localStorage, PREF_KEY)) || {}; } catch { return {}; }
  },
  setPrefs(p) { safeStorage.set(localStorage, PREF_KEY, JSON.stringify({ ...this.getPrefs(), ...p })); },
};

/* 카탈로그(그림·크기) + 서버 가격 병합 */
function getItem(id) {
  const base = ITEMS.find(i => i.id === id);
  if (!base) return null;
  return { ...base, ...(Store.itemMeta[id] || {}) };
}
function allItems() { return ITEMS.map(i => getItem(i.id)); }
function homeInfo(id) { return HOMES.find(h => h.id === id); }
