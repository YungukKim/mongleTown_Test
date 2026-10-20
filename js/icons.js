/* 단순한 선화 아이콘 모음 (24x24, stroke 기반) */
const ICON_PATHS = {
  map: '<path d="M3 6.5l6-2.3 6 2.3 6-2.3v13.6l-6 2.3-6-2.3-6 2.3z"/><path d="M9 4.4v13.4M15 6.6v13.4"/>',
  home: '<path d="M3 11.2l9-7.4 9 7.4"/><path d="M5.2 9.6V20h13.6V9.6"/><path d="M10 20v-5.6h4V20"/>',
  friends: '<circle cx="9" cy="8.2" r="3.4"/><path d="M2.6 20c.2-3.8 3-6 6.4-6s6.2 2.2 6.4 6"/><circle cx="17.2" cy="9" r="2.5"/><path d="M16.4 14c2.8.1 4.9 1.7 5.1 4.8"/>',
  mail: '<rect x="3" y="5.2" width="18" height="13.6" rx="2.4"/><path d="M3.4 7.2l8.6 6 8.6-6"/>',
  shop: '<path d="M4.2 9h15.6l-1.4 11H5.6z"/><path d="M8.6 9V7.2a3.4 3.4 0 0 1 6.8 0V9"/>',
  user: '<circle cx="12" cy="8.2" r="4"/><path d="M4.2 20.6c.3-4.4 3.6-6.8 7.8-6.8s7.5 2.4 7.8 6.8"/>',
  coin: '<circle cx="12" cy="12" r="8.6"/><path d="M8 11.4c.8-1.6 2.6-2.2 4-1.4 1.4-.8 3.2-.2 4 1.4M8.4 14.6c1.2 1.4 5.2 1.4 7.2 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.6 12.6l4.6 4.6 10.2-10.6"/>',
  alert: '<path d="M12 3.6l9.4 16.4H2.6z"/><path d="M12 9.6v4.6M12 17.2v.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.6M12 7.6v.2"/>',
  pencil: '<path d="M4 20l1.2-4.6L16 4.6l3.4 3.4L8.6 18.8z"/><path d="M13.8 6.8l3.4 3.4"/>',
  rotateL: '<path d="M4.4 9.4A8 8 0 1 1 4 14"/><path d="M4 4.6v4.8h4.8"/>',
  rotateR: '<path d="M19.6 9.4A8 8 0 1 0 20 14"/><path d="M20 4.6v4.8h-4.8"/>',
  flip: '<path d="M12 3v18" stroke-dasharray="2 2.4"/><path d="M9 6.4L3.4 17.6H9z"/><path d="M15 6.4l5.6 11.2H15z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  box: '<path d="M3.6 8l8.4-4 8.4 4v8.4L12 20.4 3.6 16.4z"/><path d="M3.6 8L12 12l8.4-4M12 12v8.4"/>',
  trash: '<path d="M4.6 6.8h14.8M9.4 6.8V4.4h5.2v2.4M6.4 6.8l1 13h9.2l1-13"/>',
  send: '<path d="M3.6 11.6L20.4 4l-5 16.4-3.8-6.6z"/><path d="M11.6 13.8L20.4 4"/>',
  reply: '<path d="M9.6 6.4L3.6 12l6 5.6"/><path d="M3.8 12h9.4c4 0 7 2.6 7.2 7"/>',
  flag: '<path d="M5.4 21V4"/><path d="M5.4 4.6c4-2 7 1.6 13 0v8.6c-6 1.6-9-2-13 0"/>',
  block: '<circle cx="12" cy="12" r="8.6"/><path d="M5.8 18.2L18.2 5.8"/>',
  heart: '<path d="M12 20s-7.6-4.6-7.6-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.6 10c0 5.4-7.6 10-7.6 10z"/>',
  door: '<path d="M6 20.4V4h10.6v16.4"/><path d="M4 20.4h16M13.4 12.4v.4"/>',
  truck: '<path d="M2.8 6.4h11v10H2.8zM13.8 9.6h4.2l3 3.4v3.4h-7.2"/><circle cx="7" cy="17.4" r="1.8"/><circle cx="17.4" cy="17.4" r="1.8"/>',
  eye: '<path d="M2.4 12s3.6-6.4 9.6-6.4S21.6 12 21.6 12s-3.6 6.4-9.6 6.4S2.4 12 2.4 12z"/><circle cx="12" cy="12" r="2.8"/>',
  lock: '<rect x="5" y="10.6" width="14" height="10" rx="2"/><path d="M8.4 10.6V8a3.6 3.6 0 0 1 7.2 0v2.6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/>',
  logout: '<path d="M9.6 20.2H5V3.8h4.6"/><path d="M15 7.4l4.6 4.6L15 16.6M19.6 12H9.4"/>',
  shield: '<path d="M12 3l7.6 3v5.6c0 4.6-3.2 8-7.6 9.4-4.4-1.4-7.6-4.8-7.6-9.4V6z"/>',
  receipt: '<path d="M5.6 3.4h12.8v17.2l-2.2-1.4-2 1.4-2.2-1.4-2.2 1.4-2-1.4-2.2 1.4z"/><path d="M8.6 8h6.8M8.6 11.6h6.8M8.6 15.2h4"/>',
  bell: '<path d="M6.2 16.6V11a5.8 5.8 0 0 1 11.6 0v5.6l1.6 1.8H4.6z"/><path d="M10 20.6c.6.8 1.2 1 2 1s1.4-.2 2-1"/>',
  list: '<path d="M8.6 6.4h11.6M8.6 12h11.6M8.6 17.6h11.6"/><path d="M4 6.4h.4M4 12h.4M4 17.6h.4"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.4"/><path d="M15.4 15.4l5 5"/>',
  undo: '<path d="M8.6 5.4L3.8 10l4.8 4.6"/><path d="M4 10h10a6 6 0 0 1 0 12h-3"/>',
  save: '<path d="M4.4 4.4h12.4l2.8 2.8v12.4H4.4z"/><path d="M8 4.4v5h7.6v-5M7.4 19.6v-6h9.2v6"/>',
  sparkle: '<path d="M12 3.4l1.8 6.8 6.8 1.8-6.8 1.8L12 20.6l-1.8-6.8L3.4 12l6.8-1.8z"/>',
};

function icon(name, extra = '') {
  const p = ICON_PATHS[name] || '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${p}</svg>`;
}

/* 로고: 몽글몽글한 구름 집 */
const LOGO_SVG = `<svg viewBox="0 0 48 48" fill="#fff" stroke="#222" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="wobble">
  <path d="M10 30c-5 0-7-6-3-9 0-6 7-8 10-5 2-6 12-6 14 0 4-3 11 0 9 6 4 2 3 8-2 8z"/>
  <path d="M17 30v10h14V30"/><path d="M22 40v-5h4v5"/>
  <circle cx="19" cy="24" r="1" fill="#222"/><circle cx="29" cy="24" r="1" fill="#222"/><path d="M22.4 26.4q1.6 1.4 3.2 0" fill="none"/>
</svg>`;
