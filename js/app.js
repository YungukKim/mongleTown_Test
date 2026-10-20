/* =========================================================
   앱 셸: 해시 라우터, 상단/하단 메뉴, 알림
   ========================================================= */

const ROUTES = [
  { path: 'start', page: 'start', public: true, bare: true },
  { path: 'login', page: 'login', public: true },
  { path: 'signup', page: 'signup', public: true },
  { path: 'verify', page: 'verify', public: true },
  { path: 'reset', page: 'reset', public: true },
  { path: 'village', page: 'village', nav: 'village' },
  { path: 'room', page: 'room', nav: 'room' },
  { path: 'room/:userId', page: 'room', nav: 'village' },
  { path: 'friends', page: 'friends', nav: 'friends' },
  { path: 'messages', page: 'messages', nav: 'messages' },
  { path: 'shop', page: 'shop', nav: 'shop' },
  { path: 'charge', page: 'charge', nav: 'shop' },
  { path: 'history', page: 'history', nav: 'shop' },
  { path: 'mypage', page: 'mypage', nav: 'mypage' },
  { path: 'admin', page: 'admin', nav: 'mypage' },
];

const NAV = [
  { id: 'village', label: '마을', href: '#/village', icon: 'map' },
  { id: 'room', label: '내 방', href: '#/room', icon: 'home' },
  { id: 'friends', label: '친구', href: '#/friends', icon: 'friends', badge: () => Api.pendingFriendCount() },
  { id: 'messages', label: '쪽지', href: '#/messages', icon: 'mail', badge: () => Api.unreadCount() },
  { id: 'shop', label: '상점', href: '#/shop', icon: 'shop' },
];

const App = {
  cleanup: null,
  leaveGuard: null,   // 저장하지 않은 편집이 있을 때 확인
  current: null,
  skipGuardOnce: false,

  pendingPay: null,   // 토스 결제창에서 돌아온 결과 (?pay=success|fail&...)

  async init() {
    applyPrefs();
    $('#main').innerHTML = loaderHTML('마을로 가는 길…');
    try {
      await Api.init();
    } catch (e) {
      console.error(e);
      $('#main').innerHTML = emptyState('서버에 연결하지 못했어요.', '인터넷 연결을 확인하고 새로고침해 주세요.', 'alert');
      return;
    }
    this.consumeUrlParams();
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('beforeunload', e => { if (this.leaveGuard && this.leaveGuard()) { e.preventDefault(); e.returnValue = ''; } });
    Bus.on('data', () => { this.renderChrome(); if (this.current && !this.current.route.public && !Api.me()) this.route(); });
    Bus.on('notify', n => toast(n.text, { icon: n.icon || 'bell', kind: 'info', duration: 3600 }));
    Bus.on('recovery', () => location.replace('#/reset?mode=new'));
    setInterval(() => { if (Api.me() && !document.hidden) Api.refresh(); }, 20000); // 새 쪽지·친구 요청 확인
    this.route();
  },

  /* 이메일 링크·결제창에서 돌아왔을 때 붙어 온 쿼리를 처리하고 주소를 정리한다 */
  consumeUrlParams() {
    const q = new URLSearchParams(location.search);
    if (![...q.keys()].length) return;
    let hash = location.hash || '';
    const pay = q.get('pay');
    if (pay) {
      this.pendingPay = { status: pay, paymentKey: q.get('paymentKey'), orderId: q.get('orderId'), amount: q.get('amount'), code: q.get('code'), message: q.get('message') };
      hash = '#/charge';
    }
    const auth = q.get('auth');
    if (auth === 'recovery') hash = '#/reset?mode=new';
    if (auth === 'verified' && Api.me()) { hash = '#/village'; setTimeout(() => toast('이메일 인증이 끝났어요. 몽글마을에 온 걸 환영해요!', { icon: 'heart' }), 300); }
    const err = q.get('error_description');
    if (err) setTimeout(() => toast('링크가 만료되었거나 잘못되었어요. 다시 요청해 주세요.', { kind: 'error', duration: 5000 }), 300);
    history.replaceState(null, '', location.pathname + hash);
  },

  go(hash) {
    if (location.hash === hash) this.route(); else location.hash = hash;
  },

  match(hash) {
    const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
    for (const r of ROUTES) {
      const rp = r.path.split('/');
      if (rp.length !== parts.length) continue;
      const params = {};
      if (rp.every((seg, i) => seg.startsWith(':') ? (params[seg.slice(1)] = decodeURIComponent(parts[i]), true) : seg === parts[i])) {
        const q = new URLSearchParams(hash.split('?')[1] || '');
        q.forEach((v, k) => { params[k] = v; });
        return { route: r, params };
      }
    }
    return null;
  },

  route() {
    const hash = location.hash || '';
    if (this.leaveGuard && this.leaveGuard() && !this.skipGuardOnce) {
      if (!window.confirm('저장하지 않은 꾸미기가 있어요. 정말 나갈까요?')) {
        this.skipGuardOnce = true;
        history.back();
        setTimeout(() => { this.skipGuardOnce = false; }, 50);
        return;
      }
    }
    if (this.skipGuardOnce) return;
    const user = Api.me();
    let m = this.match(hash);
    if (!m) { location.replace(user ? '#/village' : '#/start'); return; }
    if (!m.route.public && !user) { location.replace('#/start'); return; }
    if (m.route.public && user && ['start', 'login', 'signup'].includes(m.route.page)) { location.replace('#/village'); return; }

    if (this.cleanup) { try { this.cleanup(); } catch (e) { console.error(e); } }
    this.cleanup = null;
    this.leaveGuard = null;
    closeAllModals();
    this.current = m;
    this.renderChrome();

    const main = $('#main');
    main.innerHTML = '';
    main.className = 'main page-enter';
    void main.offsetWidth;
    const page = Pages[m.route.page];
    try {
      const c = page(main, m.params);
      if (typeof c === 'function') this.cleanup = c;
    } catch (e) {
      console.error(e);
      main.innerHTML = emptyState('화면을 그리다 연필이 부러졌어요.', '새로고침해 주세요.', 'alert');
    }
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  },

  renderChrome() {
    const user = Api.me();
    const r = this.current && this.current.route;
    const showNav = !!user && r && !r.public;
    const top = $('#topbar'), tab = $('#tabbar');
    document.body.classList.toggle('has-nav', showNav);
    top.hidden = !!(r && r.bare);
    if (!showNav) {
      top.innerHTML = `<div class="topbar-inner"><a class="logo" href="#/start">${LOGO_SVG}<span>몽글마을!</span></a></div>`;
      tab.hidden = true;
      return;
    }
    const acc = Api.myAccount();
    const cur = r.nav;
    const navLink = (n, cls) => {
      const b = n.badge ? n.badge() : 0;
      const label = n.label + (b ? ` (새 소식 ${b}개)` : '');
      return `<a href="${n.href}" ${cur === n.id ? 'aria-current="page"' : ''} aria-label="${label}">
        <span class="tab-icon">${icon(n.icon)}${b ? `<span class="badge" aria-hidden="true">${b > 99 ? '99+' : b}</span>` : ''}</span>
        <span ${cls}>${n.label}</span></a>`;
    };
    top.innerHTML = `
      <div class="topbar-inner">
        <a class="logo" href="#/village" aria-label="몽글마을 홈">${LOGO_SVG}<span>몽글마을!</span></a>
        <nav class="nav" aria-label="주요 메뉴">${NAV.map(n => navLink(n)).join('')}</nav>
        <div class="topbar-right">
          <a class="wallet-chip" href="#/charge" aria-label="보유 몽글 ${fmt(acc.balance.total)}개, 충전하기">${icon('coin')}<span>${fmt(acc.balance.total)}</span></a>
          <a class="avatar-btn" href="#/mypage" aria-label="마이페이지 (${esc(acc.profile.nickname)})" ${cur === 'mypage' ? 'aria-current="page"' : ''}>${esc(acc.profile.nickname.slice(0, 1))}</a>
        </div>
      </div>`;
    tab.hidden = false;
    tab.innerHTML = NAV.map(n => navLink(n)).join('');
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
