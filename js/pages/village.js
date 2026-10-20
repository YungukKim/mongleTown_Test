/* =========================================================
   마을 지도 · 집 상세 · 입주/이사
   ========================================================= */

const MAP_TREES = [[560, 60], [545, 220], [192, 196], [367, 196], [192, 466], [367, 466], [545, 470], [30, 690], [275, 700], [510, 700], [560, 640], [975, 690]];

function houseShape(style, { empty, mine } = {}) {
  const dash = empty ? 'stroke-dasharray="9 7"' : '';
  const shapes = [
    `<rect x="15" y="62" width="100" height="78" rx="6" class="house-body" ${dash}/>
     <path d="M4 68L65 12l61 56z" ${dash}/><path d="M92 36V18h12v29" ${dash}/>
     <rect x="52" y="98" width="26" height="42" rx="5"/><rect x="24" y="78" width="20" height="18" rx="3"/><path d="M34 78v18M24 87h20" fill="none"/>
     <rect x="86" y="78" width="20" height="18" rx="3"/><path d="M96 78v18" fill="none"/>`,
    `<rect x="15" y="64" width="100" height="76" rx="6" class="house-body" ${dash}/>
     <path d="M6 70Q65-12 124 70z" ${dash}/>
     <path d="M52 140v-26q13-14 26 0v26" /><circle cx="65" cy="44" r="10"/><path d="M65 34v20M55 44h20" fill="none"/>
     <rect x="24" y="82" width="20" height="18" rx="9"/><rect x="86" y="82" width="20" height="18" rx="9"/>`,
    `<rect x="15" y="60" width="100" height="80" rx="6" class="house-body" ${dash}/>
     <path d="M8 62l20-40h74l20 40z" ${dash}/>
     <rect x="54" y="100" width="22" height="40" rx="4"/><circle cx="71" cy="121" r="1.6" fill="#222"/>
     <rect x="22" y="76" width="24" height="16" rx="3"/><rect x="84" y="76" width="24" height="16" rx="3"/><path d="M22 84h24M84 84h24" fill="none"/>`,
  ];
  const flag = mine ? `<path d="M65 14V-14" fill="none"/><path d="M65-14l22 7-22 7z" fill="#222"/>` : '';
  return `<g class="bounce">${shapes[style] || shapes[0]}${flag}</g>`;
}

function signSVG(x, y, w, text, { empty, mine } = {}) {
  const label = mine ? '★ 내 집' : empty ? '빈집' : text;
  return `<g transform="translate(${x},${y})">
    <rect x="${-w / 2}" y="0" width="${w}" height="30" rx="14" fill="${mine ? '#222' : '#fff'}" stroke="#222" stroke-width="2.5" ${empty ? 'stroke-dasharray="6 5"' : ''}/>
    <text x="0" y="21" text-anchor="middle" class="sign-text" style="fill:${mine ? '#fff' : '#222'}">${esc(label)}</text></g>`;
}

function homeLabel(h) {
  return `${h.name}, ${h.mine ? '내 집' : h.occupantId ? `${h.occupantName}님이 살고 있어요` : h.available ? '빈집, 입주 가능' : '입주 준비 중'}`;
}

function aptSummary(homes) {
  const apts = homes.filter(h => h.kind === 'apt');
  const empty = apts.filter(h => !h.occupantId && h.available).length;
  return { apts, empty, occupied: apts.filter(h => h.occupantId).length };
}

function renderMapSVG(homes) {
  const byId = Object.fromEntries(homes.map(h => [h.id, h]));
  const { empty: aptEmpty, occupied: aptOcc } = aptSummary(homes);
  const aptLabel = `몽글아파트 세대 현황 보기, 10세대 중 ${aptOcc}세대 입주, 빈방 ${aptEmpty}개`;
  const houses = homes.filter(h => h.kind === 'house').map(h => {
    const empty = !h.occupantId;
    return `<g class="house" transform="translate(${h.x},${h.y})" role="button" tabindex="0" data-home="${h.id}" aria-label="${esc(homeLabel(h))}">
      <rect class="focus-ring" x="-6" y="-20" width="142" height="210" rx="16"/>
      <g fill="#fff" stroke="#222" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${houseShape(h.style, { empty, mine: h.mine })}</g>
      ${signSVG(65, 150, 120, h.occupantName, { empty, mine: h.mine })}
    </g>`;
  }).join('');

  const units = [];
  for (let floor = 5; floor >= 1; floor--) {
    for (let col = 1; col <= 2; col++) {
      const h = byId['a' + (floor * 100 + col)];
      const x = 710 + (col - 1) * 128, y = 112 + (5 - floor) * 96;
      const empty = !h.occupantId;
      units.push(`<g class="unit" role="button" tabindex="0" data-home="${h.id}" aria-label="${esc(homeLabel(h))}" transform="translate(${x},${y})">
        <rect class="focus-ring" x="-6" y="-6" width="124" height="88" rx="12"/>
        <rect class="unit-box" x="0" y="0" width="112" height="76" rx="8" fill="${h.mine ? '#222' : '#fff'}" stroke="#222" stroke-width="3" ${empty ? 'stroke-dasharray="8 6"' : ''}/>
        <text x="56" y="28" text-anchor="middle" class="label-text" style="fill:${h.mine ? '#fff' : '#222'}">${h.no}호</text>
        <text x="56" y="56" text-anchor="middle" class="sign-text" style="fill:${h.mine ? '#fff' : '#222'}">${esc(h.mine ? '★ 내 집' : empty ? '빈집' : h.occupantName)}</text>
      </g>`);
    }
  }

  const trees = MAP_TREES.map(([x, y]) => `<g transform="translate(${x},${y})"><path d="M0 0v-18" /><circle cx="0" cy="-30" r="16"/><circle cx="-10" cy="-22" r="9"/><circle cx="10" cy="-22" r="9"/></g>`).join('');

  return `
  <svg class="map-svg" viewBox="0 0 1000 730" role="group" aria-label="몽글마을 지도">
    <g fill="none" stroke="#222" stroke-width="3" stroke-linecap="round" class="wobble">
      <path d="M0 262Q300 250 600 262"/><path d="M0 306Q300 296 600 306"/>
      <path d="M10 284h30M80 282h30M150 281h30M220 280h30M290 280h30M360 281h30M430 282h30M500 283h30" stroke-width="2" />
      <path d="M598 0Q590 360 600 730"/><path d="M648 0Q640 360 648 730"/>
      <path d="M622 20v30M621 90v30M620 160v30M620 330v30M620 400v30M621 470v30M622 540v30M622 610v30" stroke-width="2"/>
      <path d="M40 512Q200 490 300 512T560 506" stroke-dasharray="3 12" stroke-width="4"/>
      <ellipse cx="490" cy="604" rx="44" ry="18" fill="#fff"/><path d="M470 604q8-4 16 0M494 610q8-4 16 0" stroke-width="2"/>
    </g>
    <g fill="#fff" stroke="#222" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="wobble" aria-hidden="true">
      ${trees}
      <g transform="translate(560,236)"><path d="M0 26V0"/><rect x="-12" y="-16" width="24" height="16" rx="6"/><path d="M12 -12h6v6" /></g>
    </g>
    <g class="house apt" role="button" tabindex="0" data-apt="1" aria-label="${esc(aptLabel)}">
      <rect class="focus-ring" x="668" y="40" width="314" height="656" rx="16"/>
      <g fill="#fff" stroke="#222" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="wobble">
        <path class="house-body" d="M690 92V640H960V92z"/><path d="M676 92h298l-18-40H694z"/>
        <rect x="800" y="590" width="40" height="50" rx="6"/><path d="M820 590v50" fill="none"/>
      </g>
      <text x="825" y="80" text-anchor="middle" class="sign-text">몽글아파트 · 빈방 ${aptEmpty}</text>
      ${signSVG(825, 652, 190, '세대 현황 보기 ›')}
    </g>
    <text x="580" y="262" text-anchor="end" class="label-text" aria-hidden="true">우편함</text>
    ${houses}
    ${units.join('')}
  </svg>`;
}

Pages.village = (el, params) => {
  const moveMode = params.move === '1';
  el.innerHTML = loaderHTML('마을 지도를 그리는 중…');
  let alive = true;

  const render = async () => {
    const homes = await Api.getVillage();
    if (!alive) return;
    const acc = Api.myAccount();
    const myHome = acc.home;
    const emptyCount = homes.filter(h => !h.occupantId && h.available).length;
    const banner = !myHome
      ? '마음이 머무를 곳을 골라보세요.'
      : moveMode ? '이사할 빈집을 골라주세요.' : '';
    el.innerHTML = `
      <div class="page-head">
        <div><h1>몽글마을</h1><p class="sub">이웃 ${homes.filter(h => h.occupantId).length}명 · 빈집 ${emptyCount}채</p></div>
        <div class="row">
          ${myHome ? `<a class="btn sm" href="#/room">${icon('home')}내 방 가기</a>` : ''}
          ${moveMode ? `<a class="btn sm ghost" href="#/village">이사 그만두기</a>` : ''}
        </div>
      </div>
      ${banner ? `<p class="map-banner scribble-underline" style="display:table;margin:0 auto 14px">${esc(banner)}</p>` : ''}
      <div class="village-layout">
        <div>
          <div class="map-frame">${renderMapSVG(homes)}</div>
          <div class="legend" aria-hidden="true">
            <span><svg viewBox="0 0 26 18"><rect x="2" y="2" width="22" height="14" rx="4" fill="#fff" stroke="#222" stroke-width="2"/></svg>이웃이 사는 집</span>
            <span><svg viewBox="0 0 26 18"><rect x="2" y="2" width="22" height="14" rx="4" fill="#fff" stroke="#222" stroke-width="2" stroke-dasharray="4 3"/></svg>빈집(점선)</span>
            <span><svg viewBox="0 0 26 18"><rect x="2" y="2" width="22" height="14" rx="4" fill="#222" stroke="#222" stroke-width="2"/></svg>★ 내 집</span>
          </div>
          <p class="small faint mt-1">집을 누르면 누가 사는지 볼 수 있어요. 화면이 좁으면 지도를 옆으로 밀어보세요.</p>
        </div>
        <aside class="side-panel" aria-label="마을 정보">
          <div class="card flat">
            <h3>${myHome ? '나의 집' : '아직 집이 없어요'}</h3>
            ${myHome
              ? `<p class="mb-0"><strong>${esc(myHome.name)}</strong><br><span class="small muted">${esc(myHome.address)}</span></p>
                 <div class="row mt-2"><a class="btn sm" href="#/room">들어가기</a>${moveMode ? '' : `<a class="btn sm ghost" href="#/village?move=1">${icon('truck')}이사하기</a>`}</div>`
              : `<p class="small muted mb-0">단독주택이나 아파트의 빈집 중 하나를 골라 입주해 보세요. 이사는 언제든 할 수 있어요.</p>`}
          </div>
          <div class="card flat">
            <button class="btn sm w-full" type="button" data-apt="1" style="margin-bottom:14px">${icon('list')}몽글아파트 세대 현황 · 빈방 ${aptSummary(homes).empty}</button>
            <h3>목록으로 보기</h3>
            <div class="tabs" role="tablist" aria-label="집 목록 필터">
              <button class="tab" role="tab" aria-selected="true" data-f="all">전체</button>
              <button class="tab" role="tab" aria-selected="false" data-f="empty">빈집</button>
              <button class="tab" role="tab" aria-selected="false" data-f="occupied">이웃</button>
            </div>
            <ul class="list home-list" id="home-list" style="max-height:340px;overflow:auto"></ul>
          </div>
        </aside>
      </div>`;

    const list = $('#home-list', el);
    const fillList = f => {
      const rows = homes.filter(h => f === 'all' || (f === 'empty' ? !h.occupantId : !!h.occupantId));
      list.innerHTML = rows.map(h => `<li class="list-item"><button type="button" data-home="${h.id}">
        ${avatar(h.mine ? '★' : h.occupantName || '·')}
        <span class="grow"><span class="title">${esc(h.name)}</span><br><span class="meta">${h.mine ? '내 집' : h.occupantId ? esc(h.occupantName) + '님' : '빈집'}</span></span>
      </button></li>`).join('') || `<li>${emptyState('해당하는 집이 없어요')}</li>`;
    };
    fillList('all');
    $$('.tabs .tab', el).forEach(t => t.addEventListener('click', () => {
      $$('.tabs .tab', el).forEach(x => x.setAttribute('aria-selected', x === t));
      fillList(t.dataset.f);
    }));
  };
  const onPick = e => {
    const t = e.target.closest('[data-home]');
    if (t && el.contains(t)) return openHomeDetail(t.dataset.home, { onChanged: refresh });
    const apt = e.target.closest('[data-apt]');
    if (apt && el.contains(apt)) openApartment({ onChanged: refresh });
  };
  const onKey = e => {
    if (!(e.key === 'Enter' || e.key === ' ') || !e.target.matches) return;
    if (e.target.matches('g[data-home]')) { e.preventDefault(); openHomeDetail(e.target.dataset.home, { onChanged: refresh }); }
    else if (e.target.matches('g[data-apt]')) { e.preventDefault(); openApartment({ onChanged: refresh }); }
  };
  const refresh = () => render();
  el.addEventListener('click', onPick);
  el.addEventListener('keydown', onKey);
  render();
  return () => {
    alive = false;
    el.removeEventListener('click', onPick);
    el.removeEventListener('keydown', onKey);
  };
};

/* ---------- 아파트 세대 현황 모달 ---------- */
async function openApartment({ onChanged } = {}) {
  const homes = await Api.getVillage();
  const { apts, empty, occupied } = aptSummary(homes);
  const floors = [5, 4, 3, 2, 1].map(f => apts.filter(h => h.floor === f).sort((a, b) => a.col - b.col));
  const unitBtn = h => {
    const state = h.mine ? '내 집' : h.occupantId ? `${h.occupantName}님` : h.available ? '빈방' : '입주 준비 중';
    const kind = h.mine ? 'mine' : h.occupantId ? 'occupied' : 'empty';
    const likes = h.likes || 0;
    return `<button type="button" class="apt-unit ${kind}" data-unit="${h.id}" aria-label="${h.no}호, ${esc(state)}${h.occupantId ? `, 좋아요 ${likes}개` : ''}">
      <span class="no">${h.no}호</span>
      <span class="who">${h.mine ? '★ ' : ''}${esc(state)}</span>
      <span class="meta">${h.occupantId ? `${icon('heart')} ${likes}` : h.available ? '입주 가능' : '&nbsp;'}</span>
    </button>`;
  };
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="muted mt-0">10세대 중 <strong>${occupied}세대</strong>가 살고 있고, <strong>빈방 ${empty}개</strong>가 있어요.</p>
    <div class="tabs" role="group" aria-label="세대 보기 필터">
      <button class="tab" type="button" aria-pressed="true" data-af="all">전체</button>
      <button class="tab" type="button" aria-pressed="false" data-af="empty">빈방만</button>
      <button class="tab" type="button" aria-pressed="false" data-af="occupied">이웃만</button>
    </div>
    <div class="apt-grid">
      ${floors.map(row => `<div class="apt-floor"><span class="floor-no" aria-hidden="true">${row[0].floor}층</span>${row.map(unitBtn).join('')}</div>`).join('')}
    </div>
    <p class="small muted mt-2 mb-0">세대를 누르면 입주하거나 이웃의 방을 구경할 수 있어요.</p>`;
  const { close } = openModal({ title: '몽글아파트 세대 현황', body, wide: true });
  $$('[data-af]', body).forEach(b => b.addEventListener('click', () => {
    $$('[data-af]', body).forEach(x => x.setAttribute('aria-pressed', x === b));
    $$('.apt-unit', body).forEach(u => {
      const f = b.dataset.af;
      u.hidden = f !== 'all' && (f === 'empty' ? !u.classList.contains('empty') : u.classList.contains('empty'));
    });
  }));
  $$('[data-unit]', body).forEach(b => b.addEventListener('click', () => { close(); openHomeDetail(b.dataset.unit, { onChanged }); }));
}

/* ---------- 집 상세 모달 ---------- */
async function openHomeDetail(homeId, { onChanged } = {}) {
  const d = await Api.getHomeDetail(homeId);
  const acc = Api.myAccount();
  const hasHome = !!acc.home;
  const r = d.resident;
  const art = d.kind === 'house'
    ? `<svg viewBox="-4 -20 140 165" fill="#fff" stroke="#222" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="wobble">${houseShape(HOMES.find(h => h.id === homeId).style, { empty: !d.occupied, mine: d.mine })}</svg>`
    : `<svg viewBox="0 0 120 120" fill="#fff" stroke="#222" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="wobble"><rect x="20" y="10" width="80" height="106" rx="4"/>${[0, 1, 2, 3].map(i => `<rect x="32" y="${20 + i * 22}" width="20" height="14" rx="2"/><rect x="68" y="${20 + i * 22}" width="20" height="14" rx="2"/>`).join('')}</svg>`;

  let residentHTML;
  if (d.mine) {
    residentHTML = `<div class="resident-box">${avatar(acc.profile.nickname)}<div><strong>여기는 나의 집이에요</strong><br><span class="small muted">${esc(acc.profile.nickname)}</span></div></div>`;
  } else if (r) {
    const rel = { friend: '<span class="tag solid">친구</span>', sent: '<span class="tag dashed">요청 보냄</span>', received: '<span class="tag dashed">나에게 요청함</span>', blocked: '<span class="tag">차단함</span>' }[r.relation] || '';
    residentHTML = `<div class="resident-box">${avatar(r.nickname)}<div class="grow"><strong>${esc(r.nickname)}</strong> ${rel}
      <span class="tag" aria-label="방 좋아요 ${r.likes || 0}개">${icon('heart')}${r.likes || 0}</span><br>
      <span class="small muted">${r.bio !== null ? esc(r.bio || '소개가 아직 없어요.') : '소개를 공개하지 않았어요.'}</span></div></div>`;
  } else {
    residentHTML = `<div class="resident-box">${icon('door')}<div><strong>${d.available ? '아무도 살지 않는 빈집이에요' : '지금은 입주를 준비 중인 집이에요'}</strong><br><span class="small muted">${d.available ? '마음에 든다면 입주해 보세요.' : '조금만 기다려 주세요.'}</span></div></div>`;
  }

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="home-detail-art">${art}</div>
    <dl class="kv">
      <dt>주소</dt><dd>${esc(d.address)}</dd>
      <dt>종류</dt><dd>${d.kind === 'house' ? '단독주택' : '아파트'}</dd>
      <dt>상태</dt><dd>${d.mine ? '내가 살고 있어요' : d.occupied ? '입주 완료 · 방문 가능' : d.available ? '입주 가능' : '입주 불가'}</dd>
    </dl>
    ${residentHTML}`;

  const actions = [];
  if (d.mine) {
    actions.push({ label: '내 방 들어가기', kind: 'primary', icon: 'home', onClick: c => { c(); App.go('#/room'); } });
  } else if (r) {
    if (r.relation !== 'blocked') {
      actions.push({ label: '쪽지', icon: 'mail', onClick: c => { c(); Social.compose(r.id); } });
      if (r.relation === 'none' || r.relation === 'received') {
        actions.push({ label: r.relation === 'received' ? '친구 수락' : '친구 추가', icon: 'friends', onClick: (c, b) => Social.requestFriend(r.id, b).then(ok => ok && c()) });
      }
    }
    actions.push({ label: '방 구경하기', kind: 'primary', icon: 'eye', onClick: c => { c(); App.go('#/room/' + r.id); } });
  } else if (d.available) {
    actions.push({ label: '닫기' });
    actions.push({
      label: hasHome ? '이 집으로 이사' : '여기에 입주하기', kind: 'primary', icon: hasHome ? 'truck' : 'door',
      onClick: async (c) => { c(); await moveFlow(d, acc); onChanged && onChanged(); },
    });
  }
  openModal({ title: d.name, body, actions });
}

async function moveFlow(home, acc) {
  const isMove = !!acc.home;
  const ok = await confirmDialog({
    title: isMove ? '새로운 집에서 시작해 볼까요?' : '마음이 머무를 곳, 여기로 할까요?',
    html: isMove
      ? `<table class="receipt"><tr><td>지금 사는 곳</td><td>${esc(acc.home.name)}</td></tr><tr><td>새로 살 곳</td><td>${esc(home.name)}</td></tr></table>
         <p class="small muted">가진 아이템, 몽글, 방 꾸미기는 그대로 따라가요. 지금 집은 빈집이 되어 다른 이웃이 입주할 수 있어요.</p>`
      : `<p><strong>${esc(home.name)}</strong><br><span class="muted small">${esc(home.address)}</span></p><p class="small muted">입주한 뒤에도 언제든 이사할 수 있어요.</p>`,
    ok: isMove ? '이사하기' : '입주하기',
  });
  if (!ok) return;
  try {
    const r = await Api.moveTo(home.id);
    toast(r.moved ? `${r.home.name}(으)로 이사했어요!` : `${r.home.name}에 입주했어요! 방을 꾸며볼까요?`, { icon: 'home' });
    if (!r.moved) App.go('#/room');
    else App.go('#/village');
  } catch (e) {
    toast(e.message || '입주하지 못했어요.', { kind: 'error' });
    App.go(location.hash.includes('move=1') ? '#/village?move=1' : '#/village');
  }
}
