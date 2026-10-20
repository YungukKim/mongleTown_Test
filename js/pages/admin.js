/* =========================================================
   관리자 화면 (데모)
   실서비스에서는 별도 권한·별도 경로로 분리하고 모든 변경을 기록한다.
   ========================================================= */

Pages.admin = (el, params) => {
  let tab = params.tab || 'users';
  const A = Api.admin;
  const TABS = [['users', '회원'], ['reports', '신고'], ['items', '아이템'], ['products', '충전 상품'], ['orders', '결제'], ['ledger', '재화 원장'], ['homes', '마을']];
  const STATUS = { active: '정상', suspended: '이용 제한', withdrawn: '탈퇴' };
  const ORDER = { READY: '대기', DONE: '완료', FAILED: '실패', CANCELED: '취소', REFUNDED: '환불' };

  const render = () => {
    const o = A.overview();
    el.innerHTML = `
      <div class="admin-banner">${icon('shield')}<span>데모용 관리자 화면이에요. 실서비스에서는 관리자 계정만 접근하고, 모든 변경은 기록돼요.</span></div>
      <div class="page-head"><div><h1>운영 도구</h1></div><a class="btn sm ghost" href="#/mypage">돌아가기</a></div>
      <div class="stat-row">
        <div class="stat"><div class="k">가입 회원</div><div class="v">${fmt(o.users)}</div></div>
        <div class="stat"><div class="k">입주율</div><div class="v">${o.residents}/${o.homes}</div></div>
        <div class="stat"><div class="k">미처리 신고</div><div class="v">${fmt(o.openReports)}</div></div>
        <div class="stat"><div class="k">결제 금액</div><div class="v">${fmt(o.revenue)}원</div></div>
        <div class="stat"><div class="k">쪽지 수</div><div class="v">${fmt(o.messages)}</div></div>
      </div>
      <div class="tabs" role="tablist">${TABS.map(([k, n]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${n}${k === 'reports' && o.openReports ? ` <span class="badge">${o.openReports}</span>` : ''}</button>`).join('')}</div>
      <div id="panel"></div>`;
    $$('[data-tab]', el).forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
    const panel = $('#panel', el);
    ({ users, reports, items, products, orders, ledger, homes })[tab](panel);
  };

  const table = (heads, rows) => `<div class="table-wrap"><table class="table"><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${heads.length}" class="center muted">데이터가 없어요</td></tr>`}</tbody></table></div>`;

  function users(p) {
    p.innerHTML = table(['닉네임', '이메일', '상태', '집', '몽글', '가입일', ''], A.users().map(u => `<tr>
      <td>${esc(u.nickname)} ${u.npc ? '<span class="tag dashed">이웃(시드)</span>' : ''}${u.guest ? '<span class="tag dashed">체험</span>' : ''}${u.minor ? '<span class="tag">14세 미만</span>' : ''}</td>
      <td>${esc(u.email)}</td><td><span class="tag ${u.status === 'active' ? '' : 'solid'}">${STATUS[u.status]}</span></td>
      <td>${esc(u.home)}</td><td class="num">${fmt(u.balance)}</td><td>${dateTime(u.createdAt)}</td>
      <td>${u.status === 'withdrawn' ? '' : `<button class="btn sm" data-u="${u.id}" data-s="${u.status === 'active' ? 'suspended' : 'active'}">${u.status === 'active' ? '이용 제한' : '제한 해제'}</button>`}</td></tr>`));
    $$('[data-u]', p).forEach(b => b.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: b.dataset.s === 'suspended' ? '이용을 제한할까요?' : '제한을 풀까요?', text: '변경 내역은 관리자 기록에 남아요.' }))) return;
      A.setUserStatus(b.dataset.u, b.dataset.s); toast('회원 상태를 바꿨어요.'); render();
    }));
  }

  function reports(p) {
    const RS = { open: '접수', resolved: '조치 완료', dismissed: '기각' };
    p.innerHTML = table(['접수일', '신고자', '대상', '사유', '내용', '상태', ''], A.reports().map(r => `<tr>
      <td>${dateTime(r.at)}</td><td>${esc(r.reporterName)}</td><td>${esc(r.targetName)}</td><td>${esc(r.reason)}</td>
      <td style="max-width:260px">${r.snapshot ? `“${esc(r.snapshot.slice(0, 80))}”` : '<span class="muted">사용자 신고</span>'}${r.detail ? `<br><span class="small muted">${esc(r.detail)}</span>` : ''}</td>
      <td><span class="tag ${r.status === 'open' ? 'solid' : ''}">${RS[r.status]}</span></td>
      <td>${r.status === 'open' ? `<div class="row" style="gap:4px"><button class="btn sm" data-r="${r.id}" data-s="resolved">조치</button><button class="btn sm ghost" data-r="${r.id}" data-s="dismissed">기각</button></div>` : esc(r.note || '')}</td></tr>`));
    $$('[data-r]', p).forEach(b => b.addEventListener('click', () => {
      const note = window.prompt(b.dataset.s === 'resolved' ? '조치 내용을 적어주세요 (예: 경고, 7일 이용 제한)' : '기각 사유를 적어주세요', '');
      if (note === null) return;
      A.resolveReport(b.dataset.r, b.dataset.s, note); toast('신고를 처리했어요.'); render();
    }));
  }

  function items(p) {
    p.innerHTML = table(['', '이름', '종류', '가격(몽글)', '판매', ''], A.items().map(i => `<tr>
      <td style="width:60px">${i.type === 'furniture' ? itemArt(i).replace('class="art', 'style="width:44px;height:36px" class="art') : `<span class="swatch" style="background:${i.bg};width:44px;height:36px;display:inline-block"></span>`}</td>
      <td>${esc(i.name)}</td><td>${esc(CATEGORIES.find(c => c.id === i.cat).name)}</td>
      <td><input class="inline-input" type="number" min="0" value="${i.price}" data-price="${i.id}" aria-label="${esc(i.name)} 가격" /></td>
      <td><label class="check"><input type="checkbox" data-sale="${i.id}" ${i.sale ? 'checked' : ''} aria-label="${esc(i.name)} 판매 중" /></label></td>
      <td><button class="btn sm" data-save="${i.id}">저장</button></td></tr>`));
    $$('[data-save]', p).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.save;
      A.updateItem(id, { price: $(`[data-price="${id}"]`, p).value, sale: $(`[data-sale="${id}"]`, p).checked });
      toast('아이템 정보를 저장했어요.');
    }));
  }

  function products(p) {
    p.innerHTML = table(['상품명', '결제 금액(원)', '지급 몽글', '판매', ''], A.products().map(x => `<tr>
      <td>${esc(x.name)}</td>
      <td><input class="inline-input" type="number" min="100" step="100" value="${x.price}" data-price="${x.id}" aria-label="${esc(x.name)} 금액" /></td>
      <td><input class="inline-input" type="number" min="1" value="${x.coins}" data-coins="${x.id}" aria-label="${esc(x.name)} 지급 몽글" /></td>
      <td><label class="check"><input type="checkbox" data-sale="${x.id}" ${x.sale ? 'checked' : ''} aria-label="${esc(x.name)} 판매 중" /></label></td>
      <td><button class="btn sm" data-save="${x.id}">저장</button></td></tr>`))
      + `<p class="small muted mt-1">이미 만들어진 주문은 생성 당시 금액으로 검증돼요.</p>`;
    $$('[data-save]', p).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.save;
      A.updateProduct(id, { price: $(`[data-price="${id}"]`, p).value, coins: $(`[data-coins="${id}"]`, p).value, sale: $(`[data-sale="${id}"]`, p).checked });
      toast('충전 상품을 저장했어요.');
    }));
  }

  function orders(p) {
    p.innerHTML = table(['주문번호', '회원', '상품', '금액', '몽글', '상태', '지급', '생성', ''], A.orders().map(o => `<tr>
      <td class="small">${esc(o.orderId)}</td><td>${esc(o.nickname)}</td><td>${esc(o.productName)}</td><td class="num">${fmt(o.amount)}원</td><td class="num">${fmt(o.coins)}</td>
      <td><span class="tag ${o.status === 'DONE' ? 'solid' : ''}">${ORDER[o.status]}</span>${o.failReason ? `<br><span class="small muted">${esc(o.failReason)}</span>` : ''}</td>
      <td>${o.granted ? '1회 지급' : '-'}</td><td>${dateTime(o.createdAt)}</td>
      <td>${o.status === 'DONE' ? `<button class="btn sm" data-refund="${o.orderId}">환불</button>` : ''}</td></tr>`))
      + `<h3 class="mt-3">결제 감사 로그</h3>`
      + table(['시각', '주문번호', '이벤트', '내용'], A.audit().slice(0, 50).map(a => `<tr><td>${dateTime(a.at)}</td><td class="small">${esc(a.orderId)}</td><td>${esc(a.event)}</td><td>${esc(a.detail)}</td></tr>`));
    $$('[data-refund]', p).forEach(b => b.addEventListener('click', async () => {
      const reason = window.prompt('환불 사유를 적어주세요', '사용자 요청');
      if (!reason) return;
      try { A.refund(b.dataset.refund, reason); toast('결제를 취소하고 몽글을 회수했어요.'); render(); }
      catch (e) { toast(e.message, { kind: 'error', duration: 5000 }); }
    }));
  }

  function ledger(p) {
    const TX = { charge: '충전', purchase: '구매', event: '이벤트', refund: '환불 조정', admin: '관리자 조정' };
    const userOpts = A.users().filter(u => u.status === 'active').map(u => `<option value="${u.id}">${esc(u.nickname)}</option>`).join('');
    p.innerHTML = `
      <form class="card flat" id="adjust" style="margin-bottom:16px">
        <h3>재화 조정 (무료 몽글)</h3>
        <div class="row" style="align-items:flex-end">
          <label class="field mb-0" style="flex:1;min-width:160px"><span class="label">회원</span><select class="select" id="adj-user">${userOpts}</select></label>
          <label class="field mb-0" style="width:140px"><span class="label">수량(±)</span><input class="input" type="number" id="adj-amt" placeholder="100" /></label>
          <label class="field mb-0" style="flex:2;min-width:200px"><span class="label">사유 (필수)</span><input class="input" id="adj-reason" placeholder="예: 오류 보상" /></label>
          <button class="btn primary" type="submit">반영</button>
        </div>
        <p class="small muted mb-0 mt-1">원장은 삭제할 수 없고, 잘못된 조정은 반대 조정으로만 바로잡아요.</p>
      </form>`
      + table(['시각', '회원', '유형', '유료', '무료', '사유', '처리자'], A.ledger().slice(0, 200).map(t => `<tr>
        <td>${dateTime(t.at)}</td><td>${esc(t.nickname)}</td><td>${TX[t.type]}</td><td class="num">${t.paid ? fmt(t.paid) : ''}</td><td class="num">${t.free ? fmt(t.free) : ''}</td>
        <td>${esc(t.reason || '')}${t.orderId ? `<br><span class="small muted">${esc(t.orderId)}</span>` : ''}</td><td>${t.actor ? esc(Api.nick(t.actor)) : '시스템'}</td></tr>`));
    $('#adjust', p).addEventListener('submit', e => {
      e.preventDefault();
      try { A.adjust($('#adj-user', p).value, $('#adj-amt', p).value, $('#adj-reason', p).value); toast('재화를 조정했어요.'); render(); }
      catch (err) { toast(err.message, { kind: 'error' }); }
    });
  }

  function homes(p) {
    p.innerHTML = table(['집', '종류', '거주자', '입주 가능', ''], A.homes().map(h => `<tr>
      <td>${esc(h.name)}</td><td>${h.kind === 'house' ? '단독주택' : '아파트'}</td><td>${h.occupant ? esc(h.occupant) : '<span class="muted">빈집</span>'}</td>
      <td>${h.available ? '가능' : '<span class="tag solid">닫힘</span>'}</td>
      <td>${h.occupant ? '' : `<button class="btn sm" data-home="${h.id}" data-a="${h.available ? 0 : 1}">${h.available ? '입주 닫기' : '입주 열기'}</button>`}</td></tr>`))
      + `<p class="small muted mt-1">단독주택 추가는 지도 좌표 설계와 함께 백엔드 단계에서 진행해요.</p>`;
    $$('[data-home]', p).forEach(b => b.addEventListener('click', () => { A.setHomeAvailable(b.dataset.home, b.dataset.a === '1'); render(); }));
  }

  render();
};
