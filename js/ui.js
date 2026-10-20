/* =========================================================
   공통 UI 도우미: 토스트, 모달, 확인 창, 아이템 그림 등
   ========================================================= */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = n => Number(n || 0).toLocaleString('ko-KR');

function timeAgo(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return d.toLocaleDateString('ko-KR');
}
const dateTime = iso => iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

/* 가구 선화 SVG */
function itemArt(item, cls = 'art') {
  if (!item) return '';
  if (item.type !== 'furniture') return `<span class="swatch" style="background:${item.bg}" aria-hidden="true"></span>`;
  return `<svg class="${cls} wobble" viewBox="${item.vb}" aria-hidden="true" focusable="false"><g fill="#fff" stroke="#222" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${item.svg}</g></svg>`;
}
function avatar(name, cls = '') {
  return `<span class="avatar ${cls}" aria-hidden="true">${esc((name || '?').slice(0, 1))}</span>`;
}
function coinAmount(n) { return `<span class="row" style="gap:4px;display:inline-flex">${icon('coin')}<span>${fmt(n)}</span></span>`; }

function loaderHTML(text = '연필 깎는 중…') {
  return `<div class="loader" role="status"><svg viewBox="0 0 70 40" fill="none" stroke="#222" stroke-width="3" stroke-linecap="round"><path d="M4 30 Q14 4 24 22 T44 18 T66 10"/></svg><span>${esc(text)}</span></div>`;
}

/* ---------- 토스트 ---------- */
function toast(text, opt = {}) {
  const kind = opt.kind || 'ok';
  const ic = opt.icon || (kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'check');
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'error' ? ' error' : '');
  el.innerHTML = `${icon(ic)}<span>${kind === 'error' ? '<span class="sr-only">오류: </span>' : ''}${esc(text)}</span>`;
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstElementChild.remove();
  box.appendChild(el);
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 260); }, opt.duration || 2800);
}

/* ---------- 모달 ---------- */
const modalStack = [];
function openModal({ title, body, actions = [], wide = false, onClose, dismissible = true }) {
  const lastFocus = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const id = uid('m_');
  backdrop.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      ${dismissible ? `<button class="btn icon sm ghost modal-close" type="button" aria-label="닫기">${icon('close')}</button>` : ''}
      <h2 id="${id}">${esc(title)}</h2>
      <div class="modal-body"></div>
      <div class="modal-actions"></div>
    </div>`;
  const modal = $('.modal', backdrop);
  const bodyEl = $('.modal-body', backdrop);
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const actionsEl = $('.modal-actions', backdrop);
  if (!actions.length) actionsEl.remove();

  let closed = false;
  const close = (result) => {
    if (closed) return; closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    const i = modalStack.indexOf(close); if (i >= 0) modalStack.splice(i, 1);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    onClose && onClose(result);
  };
  actions.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (a.kind || '');
    b.innerHTML = (a.icon ? icon(a.icon) : '') + esc(a.label);
    b.addEventListener('click', () => a.onClick ? a.onClick(close, b) : close(a.value));
    actionsEl.appendChild(b);
  });
  const onKey = (e) => {
    if (modalStack[modalStack.length - 1] !== close) return;
    if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(); }
    if (e.key === 'Tab') { // 포커스 가두기
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal).filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  if (dismissible) {
    backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });
    $('.modal-close', backdrop).addEventListener('click', () => close());
  }
  $('#modal-root').appendChild(backdrop);
  modalStack.push(close);
  const firstInput = $('input, textarea, select', bodyEl);
  (firstInput || $('.modal-actions .btn.primary', backdrop) || modal).focus?.();
  if (!firstInput && !$('.modal-actions .btn.primary', backdrop)) modal.setAttribute('tabindex', '-1'), modal.focus();
  return { close, el: modal, body: bodyEl };
}
function closeAllModals() { modalStack.slice().reverse().forEach(c => c()); }

function confirmDialog({ title, text, html, ok = '확인', cancel = '취소', danger = false }) {
  return new Promise(resolve => {
    openModal({
      title,
      body: html || `<p>${esc(text)}</p>`,
      onClose: v => resolve(!!v),
      actions: [
        { label: cancel, value: false },
        { label: ok, kind: danger ? 'danger primary' : 'primary', value: true },
      ],
    });
  });
}

/* 버튼 로딩 상태 + 오류 토스트를 묶은 실행기 */
async function run(btn, fn) {
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  try { return await fn(); }
  catch (e) {
    if (e instanceof ApiError) toast(e.message, { kind: 'error' });
    else { console.error(e); toast('잠시 문제가 생겼어요. 다시 시도해 주세요.', { kind: 'error' }); }
    throw e;
  } finally {
    if (btn && btn.isConnected) { btn.classList.remove('loading'); btn.disabled = false; }
  }
}
const quiet = p => p.catch(() => {});

function fieldError(input, msg) {
  const field = input.closest('.field');
  let el = field && $('.error-text', field);
  if (!msg) { input.removeAttribute('aria-invalid'); el && el.remove(); return; }
  input.setAttribute('aria-invalid', 'true');
  if (!el && field) {
    el = document.createElement('span');
    el.className = 'error-text';
    el.id = (input.id || uid('f')) + '-err';
    field.appendChild(el);
    input.setAttribute('aria-describedby', el.id);
  }
  if (el) el.innerHTML = icon('alert') + `<span>${esc(msg)}</span>`;
}

function emptyState(title, sub = '', art = 'box') {
  return `<div class="empty">${icon(art, 'class="wobble"')}<p><strong>${esc(title)}</strong></p>${sub ? `<p class="small">${esc(sub)}</p>` : ''}</div>`;
}

/* 움직임 줄이기 설정 */
function applyPrefs() {
  const p = Store.getPrefs();
  document.documentElement.classList.toggle('reduce-motion', !!p.reduceMotion);
}

/* 화면 등록소: Pages[name] = (el, params) => cleanup? */
const Pages = {};
