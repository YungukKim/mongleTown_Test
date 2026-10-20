/* =========================================================
   상점 · 재화 충전(토스페이먼츠 흐름 목업) · 구매 내역
   ========================================================= */

const POUCH_SVG = n => `<svg viewBox="0 0 100 90" fill="#fff" stroke="#222" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="wobble" aria-hidden="true">
  ${n >= 3 ? '<path d="M8 40h84l-6 46H14z"/><path d="M8 40l10-12h64l10 12" />' : n === 2 ? '<path d="M12 44q-4 40 38 42 42-2 38-42z"/><path d="M8 44h84" /><path d="M20 44q-2-10 6-10M80 44q2-10-6-10" fill="none"/>' : '<path d="M30 30q-24 20-12 44 10 14 32 14t32-14q12-24-12-44z"/><path d="M30 30q20 8 40 0M38 30l-6-14q18 6 36 0l-6 14" />'}
  ${Array.from({ length: n + 1 }, (_, i) => `<circle cx="${32 + i * 12}" cy="${n >= 3 ? 34 : 26 - (i % 2) * 6}" r="8"/>`).join('')}
</svg>`;

Pages.shop = (el, params) => {
  let cat = params.cat || 'all';
  let alive = true;
  const render = async () => {
    const items = await Api.getShop();
    if (!alive) return;
    const bal = Api.balanceSync();
    const shown = items.filter(i => cat === 'all' || i.cat === cat);
    el.innerHTML = `
      <div class="page-head">
        <div><h1>몽글 상점</h1><p class="sub">결제하지 않아도 기본 가구로 충분히 꾸밀 수 있어요.</p></div>
        <div class="row"><a class="btn sm ghost" href="#/history">${icon('receipt')}구매 내역</a><a class="btn sm" href="#/charge">${icon('coin')}${fmt(bal.total)} · 충전</a></div>
      </div>
      <div class="tabs" role="tablist" aria-label="아이템 종류">
        ${CATEGORIES.map(c => `<button class="tab" role="tab" aria-selected="${cat === c.id}" data-cat="${c.id}">${c.name}</button>`).join('')}
      </div>
      <div class="shop-grid" role="list">
        ${shown.map(i => `
          <button class="item-card ${i.sale ? '' : 'soldout'}" type="button" role="listitem" data-item="${i.id}"
            aria-label="${esc(i.name)}, ${fmt(i.price)}몽글${i.owned ? `, ${i.owned}개 보유` : ''}${i.sale ? '' : ', 판매 중지'}">
            <span class="art-box">${itemArt(i)}</span>
            <span class="name">${esc(i.name)}</span>
            <span class="price">${icon('coin')}${fmt(i.price)}</span>
            ${i.owned ? `<span class="own tag">${icon('check')}${i.stack ? `${i.owned}개 보유` : '보유 중'}</span>` : ''}
            ${i.sale ? '' : '<span class="own tag dashed">판매 중지</span>'}
          </button>`).join('') || emptyState('이 칸은 아직 비어 있어요')}
      </div>`;
    $$('[data-cat]', el).forEach(t => t.addEventListener('click', () => { cat = t.dataset.cat; render(); }));
    $$('[data-item]', el).forEach(b => b.addEventListener('click', () => openItem(items.find(i => i.id === b.dataset.item))));
  };

  const openItem = item => {
    const bal = Api.balanceSync();
    const ownedBlock = !item.stack && item.owned;
    const { close } = openModal({
      title: item.name,
      body: `
        <div class="preview-box">${item.type === 'furniture' ? itemArt(item) : `<span class="swatch" style="background:${item.bg};width:100%;height:100%"></span>`}</div>
        <p>${esc(item.desc)}</p>
        <p class="small muted">${{ furniture: '방에 자유롭게 놓을 수 있는 물건', wallpaper: '방 벽 전체를 바꾸는 벽지', floor: '방 바닥 전체를 바꾸는 바닥재' }[item.type]}
          · ${item.stack ? '여러 개 살 수 있어요' : '하나만 가질 수 있어요'}${item.owned ? ` · 지금 ${item.owned}개 가지고 있어요` : ''}</p>`,
      actions: [
        { label: '닫기' },
        ownedBlock
          ? { label: '이미 가지고 있어요', kind: 'ghost', onClick: () => {} }
          : !item.sale
            ? { label: '판매 중지', kind: 'ghost', onClick: () => {} }
            : { label: `${fmt(item.price)}몽글에 사기`, kind: 'primary', icon: 'coin', onClick: c => { c(); buyFlow(item, bal); } },
      ],
    });
  };

  const buyFlow = async (item, bal) => {
    if (bal.total < item.price) {
      const go = await confirmDialog({
        title: '몽글이 조금 모자라요',
        html: `<table class="receipt"><tr><td>${esc(item.name)}</td><td>${fmt(item.price)}몽글</td></tr><tr><td>지금 가진 몽글</td><td>${fmt(bal.total)}몽글</td></tr><tr class="total"><td>부족한 몽글</td><td>${fmt(item.price - bal.total)}몽글</td></tr></table>`,
        ok: '충전하러 가기', cancel: '다음에 할게요',
      });
      if (go) App.go('#/charge');
      return;
    }
    const idemKey = uid('k_'); // 이 확인 창에서 만든 요청은 한 번만 처리
    openModal({
      title: '이 물건을 살까요?',
      body: `<div class="row" style="justify-content:center">${itemArt(item)}</div>
        <table class="receipt">
          <tr><td>아이템</td><td>${esc(item.name)}</td></tr>
          <tr><td>가격</td><td>${fmt(item.price)}몽글</td></tr>
          <tr><td>지금 가진 몽글</td><td>${fmt(bal.total)}몽글</td></tr>
          <tr class="total"><td>구매 후 남는 몽글</td><td>${fmt(bal.total - item.price)}몽글</td></tr>
        </table>
        <p class="small muted">무료로 받은 몽글이 먼저 사용돼요. 구매한 아이템은 보관함으로 바로 들어가요.</p>`,
      actions: [
        { label: '취소' },
        { label: '살게요', kind: 'primary', icon: 'check', onClick: (close, btn) => quiet(run(btn, async () => {
          await Api.buyItem(item.id, idemKey);
          close();
          openModal({
            title: '새로운 물건이 도착했어요!',
            body: `<div class="preview-box">${itemArt(item)}</div><p class="center">${esc(item.name)}이(가) 보관함에 들어갔어요.</p>`,
            actions: [{ label: '계속 구경하기' }, { label: '방에 놓으러 가기', kind: 'primary', icon: 'home', onClick: c => { c(); App.go('#/room'); } }],
          });
          render();
        })) },
      ],
    });
  };

  render();
  return () => { alive = false; };
};

/* ---------- 충전 (토스페이먼츠 결제위젯, 테스트 모드) ---------- */
Pages.charge = (el) => {
  let selected = null;
  let alive = true;
  const render = async () => {
    let products;
    try { products = await Api.getProducts(); }
    catch (e) { el.innerHTML = emptyState('충전 상품을 불러오지 못했어요.', e.message, 'alert'); return; }
    if (!alive) return;
    const acc = Api.myAccount();
    const bal = acc.balance;
    const minorBlocked = acc.minor && !acc.guardianConsent;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>몽글 충전</h1><p class="sub">충전은 선택이에요. 결제하지 않아도 마을 생활은 충분히 즐거워요.</p></div>
        <a class="btn sm ghost" href="#/history">${icon('receipt')}충전·구매 내역</a>
      </div>
      <div class="card balance-card">
        <div><div class="small muted">지금 가진 몽글</div><div class="amount">${icon('coin')}${fmt(bal.total)}</div></div>
        <div class="small muted">충전한 몽글 ${fmt(bal.paid)} · 선물받은 몽글 ${fmt(bal.free)}</div>
      </div>
      ${minorBlocked ? `<div class="notice mt-2">${icon('shield')}<div>보호자 동의가 확인되지 않아 충전할 수 없어요. 보호자 동의가 확인되면 운영팀이 열어드려요.</div></div>` : ''}
      <h2 class="mt-3">충전 상품</h2>
      <div class="product-grid" role="radiogroup" aria-label="충전 상품">
        ${products.map((p, i) => {
          const bonus = Math.round((p.coins / (p.price / 10) - 1) * 100);
          return `<button class="card product-card" type="button" role="radio" aria-checked="${selected === p.id}" aria-pressed="${selected === p.id}" data-p="${p.id}">
            <div class="pouch">${POUCH_SVG(Math.min(i, 3))}</div>
            <h3>${esc(p.name)}</h3>
            <div class="coins">${fmt(p.coins)}몽글</div>
            <div class="bonus muted">${bonus > 0 ? `+${bonus}% 더 드려요` : '&nbsp;'}</div>
            <div class="won">${fmt(p.price)}원</div>
          </button>`;
        }).join('')}
      </div>
      <div class="row mt-3" style="justify-content:center">
        <button class="btn primary lg" id="pay" ${!selected || minorBlocked ? 'disabled' : ''}>${selected ? `${fmt(products.find(p => p.id === selected).price)}원 결제하기` : '상품을 골라주세요'}</button>
      </div>
      <div class="notice mt-3 small">${icon('info')}<div>
        · 토스페이먼츠 <strong>테스트 모드</strong>예요. 카드 정보를 넣어도 실제로 돈이 나가지 않아요.<br>
        · 결제 금액은 서버에 저장된 주문 금액과 비교해 검증한 뒤 몽글을 지급해요.<br>
        · 표시된 금액은 기획 검토용 예시예요.</div></div>`;
    $$('[data-p]', el).forEach(b => b.addEventListener('click', () => { selected = b.dataset.p; render(); }));
    const payBtn = $('#pay', el);
    payBtn.addEventListener('click', () => quiet(run(payBtn, async () => {
      const order = await Api.createOrder(selected); // 1) 서버가 주문과 금액을 만든다
      await openTossWidget(order);
    })));
  };

  /* 2) 토스 결제위젯을 띄우고 결제를 요청한다 → successUrl / failUrl 로 돌아온다 */
  const openTossWidget = async (order) => {
    if (typeof window.TossPayments !== 'function') throw new ApiError('TOSS_SDK', '토스페이먼츠 결제창을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="toss-head row between"><strong>${esc(order.orderName)}</strong><strong>${fmt(order.amount)}원</strong></div>
      <div class="small muted">주문번호 ${esc(order.orderId)}</div>
      <div id="payment-method"></div>
      <div id="agreement"></div>`;
    let leaving = false;
    const modal = openModal({
      title: '결제하기', body, wide: true,
      onClose: () => { if (!leaving) Api.failOrder(order.orderId, 'USER_CANCEL', '사용자가 결제창을 닫음'); },
      actions: [
        { label: '취소' },
        { label: `${fmt(order.amount)}원 결제`, kind: 'primary', onClick: async (close, btn) => {
          btn.classList.add('loading'); btn.disabled = true;
          try {
            leaving = true;
            await widgets.requestPayment({
              orderId: order.orderId,
              orderName: order.orderName,
              ...Api.paymentUrls(),
              customerName: Api.myAccount().profile.nickname,
              ...(Api.myAccount().email ? { customerEmail: Api.myAccount().email } : {}),
            });
          } catch (e) {
            leaving = false;
            btn.classList.remove('loading'); btn.disabled = false;
            // 약관 미동의 등은 결제창 안에서 다시 시도할 수 있게 둔다
            if (e && e.code === 'NEED_AGREEMENT_WITH_REQUIRED_TERMS') { toast('필수 약관에 동의해 주세요.', { kind: 'error' }); return; }
            toast((e && e.message) || '결제를 시작하지 못했어요.', { kind: 'error' });
          }
        } },
      ],
    });
    const payBtn = $$('.modal-actions .btn', modal.el).pop();
    payBtn.disabled = true;
    const tossPayments = window.TossPayments(Api.tossClientKey());
    const widgets = tossPayments.widgets({ customerKey: Api.me().id });
    try {
      await widgets.setAmount({ currency: 'KRW', value: order.amount });
      await Promise.all([
        widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
        widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' }),
      ]);
      payBtn.disabled = false;
    } catch (e) {
      console.error(e);
      modal.close();
      toast('결제창을 그리지 못했어요. 잠시 후 다시 시도해 주세요.', { kind: 'error' });
    }
  };

  /* 3) 결제창에서 돌아왔을 때: 성공이면 서버 승인, 실패면 기록 */
  const handleReturn = async (p) => {
    if (p.status === 'success') {
      const waiting = openModal({ title: '결제를 확인하는 중이에요', body: loaderHTML('토스페이먼츠에 승인을 요청하고 있어요…'), dismissible: false });
      try {
        const res = await Api.confirmPayment({ orderId: p.orderId, paymentKey: p.paymentKey, amount: p.amount });
        waiting.close();
        showResult(true, `${fmt(res.order.coins)}몽글이 들어왔어요! 지금 가진 몽글은 ${fmt(res.balance.total)}몽글이에요.`);
      } catch (e) {
        waiting.close();
        showResult(false, e.message);
      }
    } else {
      if (p.orderId) await Api.failOrder(p.orderId, p.code, p.message);
      showResult(false, p.code === 'PAY_PROCESS_CANCELED' ? '결제를 취소했어요.' : (p.message || '결제가 완료되지 않았어요.'));
    }
  };

  const showResult = (ok, text) => {
    openModal({
      title: ok ? '충전이 끝났어요!' : '결제가 완료되지 않았어요',
      body: `<div class="result-art">${icon(ok ? 'sparkle' : 'alert', 'class="wobble"')}</div><p class="center">${esc(text)}</p>${ok ? '' : '<p class="center small muted">결제가 되지 않았다면 몽글도 차감되지 않아요.</p>'}`,
      actions: ok ? [{ label: '내역 보기', onClick: c => { c(); App.go('#/history'); } }, { label: '상점으로', kind: 'primary', onClick: c => { c(); App.go('#/shop'); } }]
        : [{ label: '닫기', kind: 'primary' }],
    });
    selected = null;
    render();
  };

  render().then(() => {
    const p = App.pendingPay;
    App.pendingPay = null;
    if (p && alive) handleReturn(p);
  });
  return () => { alive = false; };
};

/* ---------- 내역 ---------- */
Pages.history = (el) => {
  let tab = 'tx';
  let alive = true;
  const TX = { charge: '충전', purchase: '아이템 구매', event: '이벤트 지급', refund: '환불 조정', admin: '관리자 조정' };
  const ORDER = { READY: '결제 대기', DONE: '결제 완료', FAILED: '결제 실패', CANCELED: '결제 취소', REFUNDED: '환불 완료' };
  const render = async () => {
    const h = await Api.getHistory();
    if (!alive) return;
    el.innerHTML = `
      <div class="page-head"><div><h1>몽글 내역</h1><p class="sub">몽글이 들어오고 나간 모든 기록이에요.</p></div><a class="btn sm" href="#/charge">${icon('coin')}충전하기</a></div>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" aria-selected="${tab === 'tx'}" data-t="tx">몽글 변동</button>
        <button class="tab" role="tab" aria-selected="${tab === 'orders'}" data-t="orders">결제 내역</button>
      </div>
      <div class="card"><ul class="list">
        ${tab === 'tx'
          ? h.tx.map(t => { const amt = t.paid + t.free; return `<li class="list-item"><div class="grow"><div class="title">${esc(t.reason || TX[t.type])}</div><div class="meta">${TX[t.type]} · ${dateTime(t.at)}${t.free && t.paid ? ` · 무료 ${fmt(t.free)} / 유료 ${fmt(t.paid)}` : t.free ? ' · 무료 몽글' : ' · 유료 몽글'}</div></div><strong>${amt > 0 ? '+' : ''}${fmt(amt)}</strong></li>`; }).join('') || `<li>${emptyState('아직 기록이 없어요')}</li>`
          : h.orders.map(o => `<li class="list-item"><div class="grow"><div class="title">${esc(o.productName)} · ${fmt(o.amount)}원</div><div class="meta">${esc(o.orderId)} · ${dateTime(o.createdAt)}${o.method ? ' · ' + esc(o.method) : ''}${o.failReason ? ' · ' + esc(o.failReason) : ''}</div></div><span class="tag ${o.status === 'DONE' ? 'solid' : 'dashed'}">${ORDER[o.status]}</span></li>`).join('') || `<li>${emptyState('결제 내역이 없어요')}</li>`}
      </ul></div>`;
    $$('[data-t]', el).forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; render(); }));
  };
  render();
  return () => { alive = false; };
};
