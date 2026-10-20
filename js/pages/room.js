/* =========================================================
   내 방 꾸미기 · 다른 사람 방 구경
   좌표는 방 크기 대비 %로 저장 → 화면 크기가 달라도 같은 배치
   ========================================================= */

const ROOM_RATIO = 1.5; // 가로:세로 = 3:2
const vbSize = item => { const [, , w, h] = item.vb.split(' ').map(Number); return { w, h }; };
const itemHeightPct = item => { const s = vbSize(item); return item.w * (s.h / s.w) * ROOM_RATIO; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function furniHTML(p, { editing, selected } = {}) {
  const item = getItem(p.itemId);
  if (!item) return '';
  const tf = `rotate(${p.rot || 0}deg) scaleX(${p.flip ? -1 : 1})`;
  return `<div class="furni ${selected ? 'selected' : ''}" data-inst="${p.instId}"
    style="left:${p.x}%;top:${p.y}%;width:${item.w}%;z-index:${p.z || 1};transform:${tf}"
    ${editing ? `tabindex="0" role="button" aria-label="${esc(item.name)} (방향키로 이동, Delete로 보관함에 넣기)" aria-pressed="${!!selected}"` : `role="img" aria-label="${esc(item.name)}"`}>
    ${itemArt(item)}
  </div>`;
}

/* 좋아요: 채워진 하트(누름) / 빈 하트(안 누름) — 색이 아닌 모양과 글자로 구분 */
const likeInner = r => `${icon('heart', r.liked ? 'style="fill:currentColor"' : '')}<span>${r.liked ? '좋아요 취소' : '좋아요'} · ${fmt(r.count)}</span>`;
const likeLabel = r => `${r.liked ? '좋아요 취소하기' : '이 방 좋아요'}, 지금 ${r.count}명이 좋아해요`;
function likeButtonHTML(r) {
  return `<button class="btn sm like-btn" type="button" id="like" aria-pressed="${r.liked}" aria-label="${likeLabel(r)}">${likeInner(r)}</button>`;
}
function setLikeButton(btn, r) {
  btn.innerHTML = likeInner(r);
  btn.setAttribute('aria-pressed', r.liked);
  btn.setAttribute('aria-label', likeLabel(r));
}

/* 누가 내 방을 좋아했는지 */
function openLikers(ownerId) {
  const r = Api.roomLikes(ownerId);
  openModal({
    title: `${r.count}명이 좋아해요`,
    body: r.count
      ? `<ul class="list">${r.likers.map(l => `<li class="list-item">${avatar(l.nickname)}<div class="grow"><div class="title">${esc(l.nickname)}</div><div class="meta">${timeAgo(l.at)}</div></div><a class="btn sm" href="#/room/${l.id}">${icon('eye')}방 구경</a></li>`).join('')}</ul>`
      : emptyState('아직 좋아요가 없어요', '이웃에게 방을 자랑해 볼까요?', 'heart'),
    actions: [{ label: '닫기', kind: 'primary' }],
  });
  $$('#modal-root a[href^="#/room/"]').forEach(a => a.addEventListener('click', () => closeAllModals()));
}

function roomInnerHTML(state, opts = {}) {
  const wall = getItem(state.wallpaper) || getItem('wall_plain');
  const floor = getItem(state.floor) || getItem('floor_wood');
  const empty = !state.placed.length;
  return `
    <div class="wall" style="background:${wall.bg}"></div>
    <div class="floor" style="background:${floor.bg}"></div>
    <div class="baseboard"></div>
    ${empty ? `<div class="room-empty">${esc(opts.emptyText || '아직은 텅 비어 있어요. 하나씩 채워볼까요?')}</div>` : ''}
    ${state.placed.map(p => furniHTML(p, { editing: opts.editing, selected: opts.selected === p.instId })).join('')}`;
}

Pages.room = (el, params) => {
  const me = Api.me();
  const ownerId = params.userId || me.id;
  const isMine = ownerId === me.id;
  let alive = true;
  let room, inventory = [], draft = null, editing = false, selected = null, dirty = false, invTab = 'furniture';

  el.innerHTML = loaderHTML('방 문을 여는 중…');

  const load = async () => {
    try {
      room = await Api.getRoom(ownerId);
      if (isMine) inventory = await Api.getInventory();
    } catch (e) {
      el.innerHTML = emptyState('방을 찾을 수 없어요.', e.message, 'door') + `<p class="center"><a class="btn" href="#/village">마을로 가기</a></p>`;
      return;
    }
    if (!alive) return;
    render();
  };

  /* ---------- 전체 화면 ---------- */
  const render = () => {
    if (isMine) renderMine(); else renderVisit();
  };

  const renderVisit = () => {
    const prof = Api.getProfile(ownerId);
    if (!prof) { el.innerHTML = emptyState('이웃 정보를 찾을 수 없어요.'); return; }
    const rel = prof.relation;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>${esc(prof.nickname)}님의 방</h1><p class="sub">${prof.home ? esc(prof.home.name) : '집 없이 떠도는 중'} · 구경만 할 수 있어요</p></div>
        <div class="row">
          ${rel === 'blocked' ? '' : likeButtonHTML(Api.roomLikes(ownerId))}
          <a class="btn sm ghost" href="#/village">${icon('map')}마을로</a>
        </div>
      </div>
      <div class="room-layout">
        <div class="room-stage"><div class="room" aria-label="${esc(prof.nickname)}님의 방 모습">${roomInnerHTML(room, { emptyText: '아직 가구가 없는 방이에요.' })}</div></div>
        <div class="card flat visitor-card">
          ${avatar(prof.nickname, 'lg')}
          <div class="grow" style="min-width:200px">
            <div class="row"><strong style="font-size:1.2rem">${esc(prof.nickname)}</strong>
              ${rel === 'friend' ? '<span class="tag solid">친구</span>' : rel === 'sent' ? '<span class="tag dashed">요청 보냄</span>' : rel === 'blocked' ? '<span class="tag">차단함</span>' : ''}</div>
            <p class="muted mb-0">${prof.bio !== null ? esc(prof.bio || '소개가 아직 없어요.') : '소개를 공개하지 않았어요.'}</p>
            ${prof.friends ? `<p class="small muted mb-0">친구: ${prof.friends.length ? prof.friends.map(esc).join(', ') : '아직 없어요'}</p>` : ''}
          </div>
          <div class="row">
            ${rel === 'blocked' ? `<button class="btn sm" id="unblock">차단 풀기</button>` : `
              <button class="btn sm" id="msg">${icon('mail')}쪽지</button>
              ${rel === 'none' || rel === 'received' ? `<button class="btn sm primary" id="friend">${icon('friends')}${rel === 'received' ? '친구 수락' : '친구 추가'}</button>` : ''}
              <button class="btn sm ghost" id="more" aria-label="더보기: 차단 또는 신고">⋯</button>`}
          </div>
        </div>
      </div>`;
    const on = (id, fn) => { const b = $('#' + id, el); b && b.addEventListener('click', fn); };
    on('msg', () => Social.compose(ownerId));
    on('friend', e => Social.requestFriend(ownerId, e.currentTarget).then(ok => ok && render()));
    on('unblock', e => quiet(run(e.currentTarget, async () => { await Api.unblock(ownerId); toast('차단을 풀었어요.'); render(); })));
    on('more', () => Social.userMenu(ownerId, prof.nickname, render));
    const likeBtn = $('#like', el);
    likeBtn && likeBtn.addEventListener('click', () => quiet(run(likeBtn, async () => {
      const r = await Api.toggleLike(ownerId);
      setLikeButton(likeBtn, r);
      toast(r.liked ? `${prof.nickname}님의 방을 좋아해요!` : '좋아요를 취소했어요.', { icon: 'heart', duration: 1600 });
    })));
  };

  const renderMine = () => {
    const acc = Api.myAccount();
    if (!acc.home) {
      el.innerHTML = `
        <div class="page-head"><div><h1>내 방</h1></div></div>
        <div class="card center">
          ${icon('door', 'class="wobble" style="width:80px;height:80px"')}
          <h2>아직 집이 없어요</h2>
          <p class="muted">마을에서 마음에 드는 빈집을 고르면 바로 방을 꾸밀 수 있어요.<br>환영 선물로 받은 기본 가구가 보관함에서 기다리고 있어요.</p>
          <a class="btn primary lg" href="#/village">${icon('map')}집 고르러 가기</a>
        </div>`;
      return;
    }
    const state = editing ? draft : room;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>내 방</h1><p class="sub">${esc(acc.home.name)} · ${editing ? '꾸미는 중' : '마지막 저장 ' + timeAgo(room.savedAt)}</p></div>
        <div class="row">
          ${editing
            ? `<button class="btn ghost" id="cancel">${icon('undo')}취소</button><button class="btn primary" id="save">${icon('save')}저장하기</button>`
            : `<button class="btn sm ghost" id="likers" aria-label="내 방 좋아요 ${Api.roomLikes(ownerId).count}개, 누가 눌렀는지 보기">${icon('heart', 'style="fill:currentColor"')}${fmt(Api.roomLikes(ownerId).count)}명이 좋아해요</button>
               <button class="btn primary" id="edit">${icon('pencil')}꾸미기</button>`}
        </div>
      </div>
      <div class="room-layout ${editing ? 'editing' : ''}">
        <div>
          <div class="room-stage" id="stage">
            <div class="room ${editing ? 'editing' : ''}" id="room" aria-label="내 방${editing ? ' 편집 영역' : ''}">${roomInnerHTML(state, { editing, selected })}</div>
          </div>
          ${editing ? `<p class="kbd-help">가구를 끌어서 옮기고, 누르면 도구가 나와요. 키보드: <kbd>←↑→↓</kbd> 이동(<kbd>Shift</kbd> 크게) · <kbd>[</kbd> <kbd>]</kbd> 회전 · <kbd>F</kbd> 뒤집기 · <kbd>Delete</kbd> 보관</p>` : ''}
        </div>
        ${editing ? `<aside class="card flat inventory" aria-label="보관함">
          <div class="tabs" role="tablist">
            ${[['furniture', '가구'], ['wallpaper', '벽지'], ['floor', '바닥']].map(([k, n]) => `<button class="tab" role="tab" aria-selected="${invTab === k}" data-tab="${k}">${n}</button>`).join('')}
          </div>
          <div id="inv"></div>
          <p class="small mt-2 mb-0"><a href="#/shop">${icon('shop', 'style="width:16px;height:16px;vertical-align:-3px"')} 상점에서 더 구경하기</a></p>
        </aside>` : ''}
      </div>`;

    if (!editing) {
      $('#edit', el).addEventListener('click', startEdit);
      $('#likers', el).addEventListener('click', () => openLikers(ownerId));
      return;
    }
    $('#cancel', el).addEventListener('click', cancelEdit);
    $('#save', el).addEventListener('click', e => save(e.currentTarget));
    $$('[data-tab]', el).forEach(t => t.addEventListener('click', () => { invTab = t.dataset.tab; renderMine(); }));
    renderInventory();
    bindEditor();
    renderToolbar();
  };

  /* ---------- 보관함 ---------- */
  const renderInventory = () => {
    const box = $('#inv', el);
    if (invTab === 'furniture') {
      const placedIds = new Set(draft.placed.map(p => p.instId));
      const groups = {};
      inventory.filter(i => getItem(i.itemId).type === 'furniture' && !placedIds.has(i.id)).forEach(i => { (groups[i.itemId] ||= []).push(i); });
      const keys = Object.keys(groups);
      box.innerHTML = keys.length
        ? `<div class="inv-grid">${keys.map(k => { const it = getItem(k); return `<button class="inv-item" type="button" data-place="${k}" aria-label="${esc(it.name)} 방에 놓기, ${groups[k].length}개 남음">${itemArt(it)}<span>${esc(it.name)}</span><span class="cnt">×${groups[k].length}</span></button>`; }).join('')}</div>`
        : emptyState('보관함이 비었어요', '모든 가구가 방에 나와 있어요.');
      $$('[data-place]', box).forEach(b => b.addEventListener('click', () => {
        const inst = groups[b.dataset.place][0];
        placeNew(inst);
      }));
    } else {
      const owned = [...new Set(inventory.map(i => i.itemId))].map(getItem).filter(it => it.type === invTab);
      box.innerHTML = `<div class="inv-grid">${owned.map(it => `<button class="inv-item" type="button" data-skin="${it.id}" aria-pressed="${draft[invTab] === it.id}">${itemArt(it)}<span>${esc(it.name)}</span></button>`).join('')}</div>`;
      $$('[data-skin]', box).forEach(b => b.addEventListener('click', () => {
        draft[invTab] = b.dataset.skin; dirty = true; renderMine();
      }));
    }
  };

  const placeNew = inst => {
    const item = getItem(inst.itemId);
    const h = itemHeightPct(item);
    const maxZ = Math.max(0, ...draft.placed.map(p => p.z || 0));
    const slot = [0.5, 0.2, 0.8, 0.35, 0.65, 0.1, 0.9][draft.placed.length % 7]; // 겹치지 않게 돌아가며 놓기
    const p = {
      instId: inst.id, itemId: inst.itemId,
      x: clamp(slot * 100 - item.w / 2, 0, 100 - item.w),
      y: item.wallOnly ? clamp(14, 0, 100 - h) : clamp(84 - h, 0, 100 - h),
      rot: 0, flip: false, z: maxZ + 1,
    };
    draft.placed.push(p);
    selected = p.instId; dirty = true;
    renderMine();
    const f = $(`.furni[data-inst="${p.instId}"]`, el);
    f && f.focus();
    toast(`${item.name}을(를) 놓았어요. 끌어서 옮겨보세요.`, { icon: 'sparkle', duration: 1800 });
  };

  /* ---------- 편집 시작/취소/저장 ---------- */
  const startEdit = () => {
    draft = JSON.parse(JSON.stringify({ wallpaper: room.wallpaper, floor: room.floor, placed: room.placed }));
    editing = true; dirty = false; selected = null;
    App.leaveGuard = () => editing && dirty;
    renderMine();
  };
  const cancelEdit = async () => {
    if (dirty && !(await confirmDialog({ title: '꾸민 걸 되돌릴까요?', text: '저장하지 않은 변경 사항이 모두 사라져요.', ok: '되돌리기', cancel: '계속 꾸미기' }))) return;
    editing = false; draft = null; selected = null; dirty = false;
    App.leaveGuard = null;
    renderMine();
  };
  const save = btn => quiet(run(btn, async () => {
    const sorted = draft.placed.slice().sort((a, b) => a.z - b.z).map((p, i) => ({ ...p, z: i + 1 }));
    await Api.saveRoom({ wallpaper: draft.wallpaper, floor: draft.floor, placed: sorted });
    room = await Api.getRoom(ownerId);
    inventory = await Api.getInventory();
    editing = false; draft = null; selected = null; dirty = false;
    App.leaveGuard = null;
    toast('방을 저장했어요! 새로고침해도 그대로예요.', { icon: 'save' });
    renderMine();
  }));

  /* ---------- 끌기 · 선택 ---------- */
  const findP = id => draft.placed.find(p => p.instId === id);
  const applyStyle = (node, p) => {
    node.style.left = p.x + '%'; node.style.top = p.y + '%'; node.style.zIndex = p.z;
    node.style.transform = `rotate(${p.rot}deg) scaleX(${p.flip ? -1 : 1})`;
  };
  const select = id => {
    selected = id;
    $$('.furni', el).forEach(f => { const on = f.dataset.inst === id; f.classList.toggle('selected', on); f.setAttribute('aria-pressed', on); });
    renderToolbar();
  };

  const bindEditor = () => {
    const roomEl = $('#room', el);
    let drag = null;
    roomEl.addEventListener('pointerdown', e => {
      const f = e.target.closest('.furni');
      if (!f) { select(null); return; }
      e.preventDefault();
      const p = findP(f.dataset.inst);
      select(p.instId);
      f.focus({ preventScroll: true });
      const rect = roomEl.getBoundingClientRect();
      drag = { f, p, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, rect, moved: false };
      f.setPointerCapture(e.pointerId);
      f.classList.add('dragging');
    });
    roomEl.addEventListener('pointermove', e => {
      if (!drag) return;
      const item = getItem(drag.p.itemId);
      const dx = (e.clientX - drag.sx) / drag.rect.width * 100;
      const dy = (e.clientY - drag.sy) / drag.rect.height * 100;
      if (Math.abs(dx) + Math.abs(dy) > .3) drag.moved = true;
      drag.p.x = clamp(drag.ox + dx, 0, 100 - item.w);
      drag.p.y = clamp(drag.oy + dy, 0, 100 - itemHeightPct(item));
      applyStyle(drag.f, drag.p);
      renderToolbar();
    });
    const end = () => {
      if (!drag) return;
      drag.f.classList.remove('dragging');
      if (drag.moved) dirty = true;
      drag = null;
    };
    roomEl.addEventListener('pointerup', end);
    roomEl.addEventListener('pointercancel', end);
    roomEl.addEventListener('keydown', e => {
      const f = e.target.closest('.furni');
      if (!f) return;
      const p = findP(f.dataset.inst);
      const step = e.shiftKey ? 5 : 1;
      const item = getItem(p.itemId);
      const keys = {
        ArrowLeft: () => { p.x = clamp(p.x - step, 0, 100 - item.w); },
        ArrowRight: () => { p.x = clamp(p.x + step, 0, 100 - item.w); },
        ArrowUp: () => { p.y = clamp(p.y - step, 0, 100 - itemHeightPct(item)); },
        ArrowDown: () => { p.y = clamp(p.y + step, 0, 100 - itemHeightPct(item)); },
        '[': () => tool('rotL', p), ']': () => tool('rotR', p), f: () => tool('flip', p), F: () => tool('flip', p),
        Delete: () => tool('store', p), Backspace: () => tool('store', p),
        Escape: () => select(null),
        Enter: () => select(p.instId), ' ': () => select(p.instId),
      };
      if (!keys[e.key]) return;
      e.preventDefault();
      if (selected !== p.instId && !['Enter', ' '].includes(e.key)) select(p.instId);
      keys[e.key]();
      if (!['Escape', 'Enter', ' ', 'Delete', 'Backspace'].includes(e.key)) dirty = true;
      const node = $(`.furni[data-inst="${p.instId}"]`, el);
      if (node) applyStyle(node, p);
      renderToolbar();
    });
  };

  /* ---------- 선택 도구 ---------- */
  const tool = (kind, p) => {
    const maxZ = Math.max(...draft.placed.map(x => x.z));
    const minZ = Math.min(...draft.placed.map(x => x.z));
    switch (kind) {
      case 'rotL': p.rot = ((p.rot || 0) - 15 + 360) % 360; break;
      case 'rotR': p.rot = ((p.rot || 0) + 15) % 360; break;
      case 'flip': p.flip = !p.flip; break;
      case 'front': p.z = maxZ + 1; break;
      case 'back': draft.placed.forEach(x => { x.z += 1; }); p.z = minZ; break;
      case 'store':
        draft.placed = draft.placed.filter(x => x !== p);
        selected = null; dirty = true;
        toast(`${getItem(p.itemId).name}을(를) 보관함에 넣었어요.`, { icon: 'box', duration: 1600 });
        renderMine();
        return;
    }
    dirty = true;
    draft.placed.forEach(x => { const n = $(`.furni[data-inst="${x.instId}"]`, el); n && applyStyle(n, x); });
    renderToolbar();
  };

  const renderToolbar = () => {
    const stage = $('#stage', el);
    if (!stage) return;
    let bar = $('.furni-toolbar', stage);
    const p = selected && draft && findP(selected);
    if (!p) { bar && bar.remove(); return; }
    const item = getItem(p.itemId);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'furni-toolbar';
      bar.setAttribute('role', 'toolbar');
      bar.innerHTML = [
        ['rotL', 'rotateL', '왼쪽으로 돌리기'], ['rotR', 'rotateR', '오른쪽으로 돌리기'], ['flip', 'flip', '좌우 뒤집기'],
        ['front', 'up', '맨 앞으로'], ['back', 'down', '맨 뒤로'], ['store', 'box', '보관함에 넣기'],
      ].map(([k, ic, label]) => `<button class="btn icon sm" type="button" data-tool="${k}" aria-label="${label}" title="${label}">${icon(ic)}</button>`).join('');
      bar.addEventListener('pointerdown', e => e.stopPropagation());
      bar.addEventListener('click', e => {
        const b = e.target.closest('[data-tool]');
        const cur = selected && findP(selected);
        if (b && cur) tool(b.dataset.tool, cur);
      });
      stage.appendChild(bar);
    }
    bar.setAttribute('aria-label', `${item.name} 도구`);
    const below = p.y < 16;
    bar.style.left = clamp(p.x + item.w / 2, 14, 86) + '%';
    bar.style.top = (below ? p.y + itemHeightPct(item) : p.y) / 100 * stage.offsetHeight + 'px';
    bar.style.transform = below ? 'translate(-50%, 12px)' : '';
  };

  load();
  return () => { alive = false; App.leaveGuard = null; };
};
