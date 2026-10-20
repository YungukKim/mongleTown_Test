/* =========================================================
   친구 · 쪽지 · 차단 · 신고
   ========================================================= */

const Social = {
  /* 쪽지 쓰기 모달 (toId 없으면 받는 사람 선택) */
  async compose(toId, { replyTo } = {}) {
    const targets = await Api.messageTargets();
    const max = Api.LIMITS.messageMax;
    const body = document.createElement('div');
    const fixed = toId ? targets.find(t => t.id === toId) : null;
    if (toId && !fixed) { toast('지금은 이 이웃에게 쪽지를 보낼 수 없어요.', { kind: 'error' }); return; }
    const prefNote = t => t.msgFrom === 'none' ? ' · 쪽지 안 받음' : (t.msgFrom === 'friends' && !t.friend) ? ' · 친구만 받음' : '';
    body.innerHTML = `
      <p class="muted mt-0">오늘은 어떤 안부를 전할까요?</p>
      <div class="field">
        <label class="label" for="to">받는 이웃</label>
        ${fixed
          ? `<div class="row">${avatar(fixed.nickname)}<strong>${esc(fixed.nickname)}</strong>${fixed.friend ? '<span class="tag solid">친구</span>' : ''}<span class="small muted">${prefNote(fixed)}</span></div><input type="hidden" id="to" value="${fixed.id}">`
          : `<select class="select" id="to"><option value="">이웃을 골라주세요</option>
              ${targets.map(t => `<option value="${t.id}">${t.friend ? '★ ' : ''}${esc(t.nickname)}${prefNote(t)}</option>`).join('')}</select>`}
      </div>
      <div class="field">
        <label class="label" for="body">안부</label>
        <textarea class="textarea" id="body" maxlength="${max + 50}" placeholder="잘 지냈어요? 오늘은…">${replyTo ? '' : ''}</textarea>
        <div class="counter" id="counter" aria-live="polite">0 / ${max}</div>
        <span class="hint">글자만 보낼 수 있어요. 개인정보(연락처, 주소 등)는 적지 않는 게 좋아요.</span>
      </div>
      ${replyTo ? `<div class="notice small">${icon('reply')}<div><strong>${esc(replyTo.fromName)}</strong>님의 쪽지에 답장해요<br><span class="muted">“${esc(replyTo.body.slice(0, 60))}${replyTo.body.length > 60 ? '…' : ''}”</span></div></div>` : ''}`;
    const ta = $('#body', body), counter = $('#counter', body);
    ta.addEventListener('input', () => {
      const n = ta.value.length;
      counter.textContent = `${n} / ${max}${n > max ? ' (너무 길어요)' : ''}`;
      counter.classList.toggle('over', n > max);
    });
    openModal({
      title: '쪽지 쓰기', body,
      actions: [
        { label: '취소' },
        { label: '보내기', kind: 'primary', icon: 'send', onClick: (close, btn) => {
          const to = $('#to', body).value;
          if (!to) { toast('받을 이웃을 골라주세요.', { kind: 'error' }); return; }
          if (ta.value.length > max) { fieldError(ta, `${max}자까지 쓸 수 있어요. 조금만 줄여주세요.`); ta.focus(); return; }
          quiet(run(btn, async () => {
            await Api.sendMessage(to, ta.value);
            close();
            toast('쪽지를 보냈어요! 마음이 잘 전해질 거예요.', { icon: 'send' });
            Bus.emit('messages-changed');
          }));
        } },
      ],
    });
  },

  /* 친구 요청 (확인 창 포함). 성공하면 true */
  async requestFriend(toId, btn) {
    const prof = Api.getProfile(toId);
    if (prof.relation === 'received') {
      const req = (await Api.getFriends()).received.find(r => r.other.id === toId);
      if (req) {
        await run(btn, () => Api.respondFriend(req.id, true)).catch(() => null);
        toast(`${prof.nickname}님과 친구가 되었어요!`, { icon: 'heart' });
        return true;
      }
    }
    const ok = await confirmDialog({
      title: '이웃에게 다정한 인사를 건네볼까요?',
      html: `<div class="row">${avatar(prof.nickname)}<div><strong>${esc(prof.nickname)}</strong><br><span class="small muted">상대가 수락하면 친구가 돼요.</span></div></div>`,
      ok: '친구 요청 보내기',
    });
    if (!ok) return false;
    try {
      const r = await run(btn, () => Api.sendFriendRequest(toId));
      toast(r.status === 'accepted' ? `${prof.nickname}님과 친구가 되었어요!` : '친구 요청을 보냈어요. 답을 기다려 볼까요?', { icon: 'friends' });
      return true;
    } catch { return false; }
  },

  /* 더보기 메뉴: 차단 / 신고 */
  userMenu(userId, nickname, after) {
    const { close } = openModal({
      title: nickname + '님',
      body: `<div class="stack">
        <button class="btn w-full" id="m-block">${icon('block')}차단하기</button>
        <button class="btn w-full ghost" id="m-report">${icon('flag')}신고하기</button>
      </div>`,
    });
    $('#m-block').addEventListener('click', async () => { close(); if (await Social.block(userId, nickname)) after && after(); });
    $('#m-report').addEventListener('click', () => { close(); Social.report({ targetId: userId, nickname }); });
  },

  async block(userId, nickname) {
    const ok = await confirmDialog({
      title: `${nickname}님을 차단할까요?`,
      html: `<p>차단하면 이렇게 돼요.</p><ul class="small"><li>서로 쪽지와 친구 요청을 보낼 수 없어요.</li><li>친구 관계와 대기 중인 요청이 정리돼요.</li><li>이 이웃의 쪽지가 내 쪽지함에 보이지 않아요.</li><li>상대에게 차단 사실을 알리지 않아요.</li></ul><p class="small muted">친구 화면의 ‘차단 목록’에서 언제든 풀 수 있어요.</p>`,
      ok: '차단하기', danger: true,
    });
    if (!ok) return false;
    await Api.block(userId);
    toast(`${nickname}님을 차단했어요.`, { icon: 'block' });
    return true;
  },

  report({ targetId, nickname, message }) {
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="muted mt-0">${message ? '이 쪽지를 운영팀에 알려요. 쪽지 내용이 함께 전달돼요.' : `${esc(nickname)}님을 운영팀에 알려요.`}</p>
      <fieldset><legend>어떤 문제가 있나요?</legend>
        ${REPORT_REASONS.map((r, i) => `<label class="check"><input type="radio" name="reason" value="${r}" ${i === 0 ? 'checked' : ''}/> <span>${r}</span></label>`).join('')}
      </fieldset>
      <label class="field"><span class="label">자세한 내용 (선택)</span><textarea class="textarea" id="detail" style="min-height:80px" maxlength="200"></textarea></label>
      <label class="check"><input type="checkbox" id="also-block" /> <span>이 이웃을 함께 차단할게요</span></label>`;
    openModal({
      title: '신고하기', body,
      actions: [
        { label: '취소' },
        { label: '신고하기', kind: 'primary', icon: 'flag', onClick: (close, btn) => quiet(run(btn, async () => {
          await Api.report({ messageId: message && message.id, targetId, reason: $('input[name=reason]:checked', body).value, detail: $('#detail', body).value });
          if ($('#also-block', body).checked) await Api.block(targetId);
          close();
          toast('신고가 접수됐어요. 알려줘서 고마워요.', { icon: 'shield' });
          Bus.emit('messages-changed');
        })) },
      ],
    });
  },
};

/* ---------- 친구 화면 ---------- */
Pages.friends = (el, params) => {
  let tab = params.tab || 'friends';
  let alive = true;
  const render = async () => {
    const data = await Api.getFriends();
    if (!alive) return;
    const counts = { friends: data.friends.length, received: data.received.length, sent: data.sent.length, blocked: data.blocked.length };
    el.innerHTML = `
      <div class="page-head">
        <div><h1>친구</h1><p class="sub">느슨하지만 따뜻하게 연결돼요.</p></div>
        <a class="btn sm" href="#/village">${icon('map')}이웃 찾으러 가기</a>
      </div>
      <div class="tabs" role="tablist" aria-label="친구 목록 구분">
        ${[['friends', '친구'], ['received', '받은 요청'], ['sent', '보낸 요청'], ['blocked', '차단 목록']].map(([k, n]) =>
          `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${n} ${k === 'received' && counts[k] ? `<span class="badge">${counts[k]}</span>` : `<span class="small faint">${counts[k]}</span>`}</button>`).join('')}
      </div>
      <div class="card" role="tabpanel"><ul class="list" id="flist"></ul></div>`;
    const list = $('#flist', el);
    const row = (p, actions, meta) => `<li class="list-item">${avatar(p.nickname)}
      <div class="grow"><div class="title">${esc(p.nickname)}</div><div class="meta ellipsis">${meta}</div></div>
      <div class="row" style="gap:6px">${actions}</div></li>`;
    if (tab === 'friends') {
      list.innerHTML = data.friends.map(f => row(f.other,
        `<button class="btn sm icon" data-act="msg" data-id="${f.other.id}" aria-label="${esc(f.other.nickname)}님에게 쪽지">${icon('mail')}</button>
         <a class="btn sm icon" href="#/room/${f.other.id}" aria-label="${esc(f.other.nickname)}님 방 구경">${icon('eye')}</a>
         <button class="btn sm icon ghost" data-act="remove" data-id="${f.other.id}" data-name="${esc(f.other.nickname)}" aria-label="${esc(f.other.nickname)}님 친구 끊기">${icon('trash')}</button>`,
        f.other.home ? esc(f.other.home.name) : '집 없음')).join('') || `<li>${emptyState('아직 친구가 없어요', '마을을 산책하며 이웃에게 인사를 건네보세요.', 'friends')}</li>`;
    } else if (tab === 'received') {
      list.innerHTML = data.received.map(f => row(f.other,
        `<button class="btn sm primary" data-act="accept" data-id="${f.id}">${icon('check')}수락</button>
         <button class="btn sm ghost" data-act="reject" data-id="${f.id}">거절</button>
         <button class="btn sm icon ghost" data-act="block" data-id="${f.other.id}" data-name="${esc(f.other.nickname)}" aria-label="${esc(f.other.nickname)}님 차단">${icon('block')}</button>`,
        timeAgo(f.at) + ' 요청')).join('') || `<li>${emptyState('받은 친구 요청이 없어요', '', 'bell')}</li>`;
    } else if (tab === 'sent') {
      list.innerHTML = data.sent.map(f => row(f.other,
        `<button class="btn sm ghost" data-act="cancel" data-id="${f.id}">요청 취소</button>`,
        `${timeAgo(f.at)} 보냄 · 답을 기다리는 중`)).join('') || `<li>${emptyState('보낸 요청이 없어요', '', 'send')}</li>`;
    } else {
      list.innerHTML = data.blocked.map(b => row(b,
        `<button class="btn sm" data-act="unblock" data-id="${b.id}">차단 풀기</button>`, timeAgo(b.at) + ' 차단')).join('')
        || `<li>${emptyState('차단한 이웃이 없어요', '', 'shield')}</li>`;
    }
    $$('[data-tab]', el).forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; render(); }));
    $$('[data-act]', list).forEach(b => b.addEventListener('click', () => act(b)));
  };
  const act = async b => {
    const id = b.dataset.id, name = b.dataset.name;
    const doIt = (fn, msg, ic) => run(b, fn).then(() => toast(msg, { icon: ic })).catch(() => {});
    switch (b.dataset.act) {
      case 'msg': return Social.compose(id);
      case 'accept': await doIt(() => Api.respondFriend(id, true), '이제 친구예요!', 'heart'); break;
      case 'reject': await doIt(() => Api.respondFriend(id, false), '요청을 거절했어요. 상대에게 따로 알리지 않아요.', 'info'); break;
      case 'cancel': await doIt(() => Api.cancelFriendRequest(id), '요청을 취소했어요.', 'info'); break;
      case 'unblock': await doIt(() => Api.unblock(id), '차단을 풀었어요.', 'check'); break;
      case 'block': await Social.block(id, name); break;
      case 'remove':
        if (!(await confirmDialog({ title: `${name}님과 친구를 끊을까요?`, text: '친구 목록에서 사라지고, 다시 친구가 되려면 요청을 새로 보내야 해요.', ok: '친구 끊기', danger: true }))) return;
        await Api.removeFriend(id); toast('친구 목록에서 지웠어요.', { icon: 'info' });
        break;
    }
    render();
  };
  const off = Bus.on('data', () => { if (!document.querySelector('.modal-backdrop')) render(); });
  render();
  return () => { alive = false; off(); };
};

/* ---------- 쪽지함 ---------- */
Pages.messages = (el, params) => {
  let box = params.box || 'inbox';
  let openId = null;
  let alive = true;

  const render = async () => {
    const list = await Api.getMessages(box === 'sent' ? 'sent' : 'inbox');
    if (!alive) return;
    const unread = Api.unreadCount();
    const prefs = Api.myAccount().profile;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>쪽지함</h1><p class="sub">답장이 늦어도 괜찮아요. 천천히 마음을 나눠요.</p></div>
        <button class="btn primary" id="write">${icon('pencil')}쪽지 쓰기</button>
      </div>
      <div class="two-col">
        <section class="card flat" aria-label="쪽지 목록">
          <div class="tabs" role="tablist">
            <button class="tab" role="tab" aria-selected="${box === 'inbox'}" data-box="inbox">받은 쪽지 ${unread ? `<span class="badge">${unread}</span>` : ''}</button>
            <button class="tab" role="tab" aria-selected="${box === 'sent'}" data-box="sent">보낸 쪽지</button>
          </div>
          <ul class="list" id="mlist">
            ${list.map(m => {
              const isUnread = box === 'inbox' && !m.readAt;
              return `<li class="list-item msg-item ${isUnread ? 'unread' : ''} ${openId === m.id ? 'active' : ''}" data-id="${m.id}" tabindex="0" role="button"
                  aria-label="${esc(box === 'inbox' ? m.fromName + '님이 보낸 쪽지' : m.toName + '님에게 보낸 쪽지')}${isUnread ? ', 안 읽음' : ''}">
                ${avatar(box === 'inbox' ? m.fromName : m.toName)}
                <div class="grow"><div class="row between"><span class="title">${esc(box === 'inbox' ? m.fromName : m.toName + '님에게')}</span><span class="meta">${timeAgo(m.at)}</span></div>
                  <div class="meta ellipsis">${esc(m.body)}</div>
                  ${box === 'sent' ? `<span class="state tag ${m.readAt ? 'solid' : 'dashed'}">${m.readAt ? '읽음' : '안 읽음'}</span>` : isUnread ? '<span class="state tag dashed">새 쪽지</span>' : ''}
                </div></li>`;
            }).join('') || `<li>${emptyState(box === 'inbox' ? '받은 쪽지가 없어요' : '보낸 쪽지가 없어요', box === 'inbox' ? '먼저 안부를 건네보는 건 어때요?' : '', 'mail')}</li>`}
          </ul>
          <p class="small muted mt-2 mb-0">${icon('lock', 'style="width:16px;height:16px;vertical-align:-3px"')} 쪽지 받기: <strong>${{ all: '모든 이웃', friends: '친구만', none: '받지 않음' }[prefs.msgFrom]}</strong> · <a href="#/mypage">바꾸기</a></p>
        </section>
        <section id="reader" aria-live="polite">${openId ? '' : `<div class="card flat">${emptyState('쪽지를 골라 읽어보세요', '', 'mail')}</div>`}</section>
      </div>`;

    $('#write', el).addEventListener('click', () => Social.compose());
    $$('[data-box]', el).forEach(t => t.addEventListener('click', () => { box = t.dataset.box; openId = null; render(); }));
    $$('.msg-item', el).forEach(li => {
      const open = () => openMsg(list.find(m => m.id === li.dataset.id));
      li.addEventListener('click', open);
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    if (openId) { const m = list.find(x => x.id === openId); if (m) showReader(m); else openId = null; }
  };

  const openMsg = async m => {
    openId = m.id;
    if (box === 'inbox' && !m.readAt) {
      await Api.markRead(m.id); // 수신자가 열었을 때만 읽음 처리
      return; // data 이벤트로 다시 그려짐
    }
    $$('.msg-item', el).forEach(li => li.classList.toggle('active', li.dataset.id === m.id));
    showReader(m);
  };

  const showReader = m => {
    const r = $('#reader', el);
    const other = box === 'inbox' ? { id: m.from, name: m.fromName } : { id: m.to, name: m.toName };
    r.innerHTML = `
      <article class="letter">
        <div class="letter-head"><div class="from">${box === 'inbox' ? `${esc(m.fromName)}님이 보낸 쪽지` : `${esc(m.toName)}님에게 보낸 쪽지`}</div>
          <div class="small muted">${dateTime(m.at)}${box === 'sent' ? ` · ${m.readAt ? '읽음 ' + timeAgo(m.readAt) : '아직 안 읽음'}` : ''}</div></div>
        <div class="letter-body">${esc(m.body)}</div></article>
      <div class="letter-actions">
        ${box === 'inbox' ? `<button class="btn sm primary" id="r-reply">${icon('reply')}답장</button>` : ''}
        <a class="btn sm" href="#/room/${other.id}">${icon('eye')}방 구경</a>
        <button class="btn sm ghost" id="r-del">${icon('trash')}삭제</button>
        ${box === 'inbox' ? `<button class="btn sm ghost" id="r-report">${icon('flag')}신고</button><button class="btn sm ghost" id="r-block">${icon('block')}차단</button>` : ''}
      </div>`;
    const on = (id, fn) => { const b = $('#' + id, r); b && b.addEventListener('click', fn); };
    on('r-reply', () => Social.compose(m.from, { replyTo: m }));
    on('r-del', async () => {
      if (!(await confirmDialog({ title: '쪽지를 지울까요?', text: '내 쪽지함에서만 사라지고, 상대방의 쪽지함에는 그대로 남아요.', ok: '지우기', danger: true }))) return;
      await Api.deleteMessage(m.id); openId = null; toast('쪽지를 지웠어요.', { icon: 'trash' }); render();
    });
    on('r-report', () => Social.report({ targetId: m.from, nickname: m.fromName, message: m }));
    on('r-block', async () => { if (await Social.block(m.from, m.fromName)) { openId = null; render(); } });
    if (window.innerWidth < 900) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const offs = [
    Bus.on('data', () => { if (!document.querySelector('.modal-backdrop')) render(); }),
    Bus.on('messages-changed', () => render()),
  ];
  render();
  return () => { alive = false; offs.forEach(f => f()); };
};
