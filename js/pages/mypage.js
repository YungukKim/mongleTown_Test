/* =========================================================
   마이페이지: 프로필 · 공개 범위 · 주거 · 화면 설정 · 계정
   ========================================================= */

Pages.mypage = (el) => {
  const render = () => {
    const acc = Api.myAccount();
    const p = acc.profile;
    const prefs = Store.getPrefs();
    el.innerHTML = `
      <div class="page-head"><div><h1>마이페이지</h1><p class="sub">나와 내 공간을 돌보는 곳</p></div></div>
      <div class="mypage-grid">
        <section class="card" aria-labelledby="sec-profile">
          <div class="profile-head">${avatar(p.nickname, 'lg')}
            <div><div class="nick">${esc(p.nickname)}</div><div class="small muted">주민번호(ID) ${esc(acc.id.slice(-8))}${acc.guest ? ' · 체험 계정' : ''}</div></div></div>
          <h2 id="sec-profile" class="mt-3" style="font-size:1.5rem">프로필</h2>
          <form id="profile-form" novalidate>
            <label class="field"><span class="label">닉네임</span><input class="input" id="nick" maxlength="10" value="${esc(p.nickname)}" /></label>
            <label class="field"><span class="label">한 줄 소개</span><input class="input" id="bio" maxlength="80" value="${esc(p.bio)}" placeholder="이웃에게 나를 소개해 보세요" /><span class="hint">80자까지</span></label>
            <button class="btn" type="submit">${icon('save')}프로필 저장</button>
          </form>
        </section>

        <section class="card" aria-labelledby="sec-privacy">
          <h2 id="sec-privacy" style="font-size:1.5rem">공개 범위와 쪽지</h2>
          <p class="small muted">닉네임과 사는 집은 항상 공개돼요. 이메일 같은 실제 정보는 누구에게도 보이지 않아요.</p>
          <label class="switch"><span>한 줄 소개 공개<span class="state">${p.bioPublic ? '공개 중' : '비공개'}</span></span><input type="checkbox" data-pref="bioPublic" ${p.bioPublic ? 'checked' : ''} /></label>
          <label class="switch"><span>친구 목록 공개<span class="state">${p.friendsPublic ? '공개 중' : '비공개'}</span></span><input type="checkbox" data-pref="friendsPublic" ${p.friendsPublic ? 'checked' : ''} /></label>
          <fieldset class="mt-2"><legend>쪽지를 받을 이웃</legend>
            ${[['all', '모든 이웃'], ['friends', '친구만'], ['none', '받지 않음']].map(([v, n]) => `<label class="check"><input type="radio" name="msgFrom" value="${v}" ${p.msgFrom === v ? 'checked' : ''}/> <span>${n}</span></label>`).join('')}
          </fieldset>
        </section>

        <section class="card" aria-labelledby="sec-home">
          <h2 id="sec-home" style="font-size:1.5rem">나의 집</h2>
          ${acc.home
            ? `<p><strong>${esc(acc.home.name)}</strong><br><span class="small muted">${esc(acc.home.address)}</span></p>
               <div class="row"><a class="btn sm" href="#/room">${icon('home')}내 방</a><a class="btn sm" href="#/village?move=1">${icon('truck')}이사하기</a></div>
               <p class="small muted mt-2 mb-0">이사해도 아이템, 몽글, 방 꾸미기는 그대로 따라가요. 오래 접속하지 않아도 집이 사라지지 않아요.</p>`
            : `<p class="muted">아직 집이 없어요.</p><a class="btn sm primary" href="#/village">${icon('map')}집 고르기</a>`}
          <h2 class="mt-3" style="font-size:1.5rem">지갑</h2>
          <p class="mb-0"><strong style="font-size:1.4rem">${fmt(acc.balance.total)}몽글</strong></p>
          <p class="small muted">충전한 몽글 ${fmt(acc.balance.paid)} · 선물받은 몽글 ${fmt(acc.balance.free)}</p>
          <div class="row"><a class="btn sm" href="#/charge">${icon('coin')}충전</a><a class="btn sm ghost" href="#/history">${icon('receipt')}내역</a></div>
        </section>

        <section class="card" aria-labelledby="sec-settings">
          <h2 id="sec-settings" style="font-size:1.5rem">화면 설정</h2>
          <label class="switch"><span>움직임 줄이기<span class="state">${prefs.reduceMotion ? '켜짐' : '꺼짐'}</span><br><span class="small muted">흔들림, 튀어 오르는 효과를 꺼요.</span></span><input type="checkbox" id="reduce" ${prefs.reduceMotion ? 'checked' : ''} /></label>
          <h2 class="mt-3" style="font-size:1.5rem">계정</h2>
          <div class="stack">
            <button class="btn w-full" id="logout">${icon('logout')}로그아웃</button>
            ${acc.role === 'admin' ? `<a class="btn w-full ghost" href="#/admin">${icon('settings')}관리자 화면</a>` : ''}
            <button class="link-btn small muted" id="withdraw">회원 탈퇴</button>
          </div>
        </section>
      </div>`;

    $('#profile-form', el).addEventListener('submit', e => {
      e.preventDefault();
      const nick = $('#nick', el);
      quiet(run($('button[type=submit]', e.target), async () => {
        try { await Api.updateProfile({ nickname: nick.value, bio: $('#bio', el).value }); }
        catch (err) { fieldError(nick, err.message); throw err; }
        fieldError(nick, '');
        toast('프로필을 저장했어요.');
        render();
      }));
    });
    $$('[data-pref]', el).forEach(c => c.addEventListener('change', async () => {
      await Api.updateProfile({ [c.dataset.pref]: c.checked });
      toast(c.checked ? '공개로 바꿨어요.' : '비공개로 바꿨어요.', { icon: 'lock' });
      render();
    }));
    $$('input[name=msgFrom]', el).forEach(r => r.addEventListener('change', async () => {
      await Api.updateProfile({ msgFrom: r.value });
      toast('쪽지 받기 설정을 바꿨어요.', { icon: 'mail' });
    }));
    $('#reduce', el).addEventListener('change', e => { Store.setPrefs({ reduceMotion: e.target.checked }); applyPrefs(); render(); });
    $('#logout', el).addEventListener('click', async () => {
      if (!(await confirmDialog({ title: '로그아웃할까요?', text: acc.guest ? '체험 계정은 로그아웃하면 다시 들어올 수 없어요. 계속할까요?' : '집과 방은 그대로 기다리고 있을게요.', ok: '로그아웃', danger: acc.guest }))) return;
      await Api.logout(); toast('또 놀러 와요!', { icon: 'heart' }); App.go('#/start');
    });
    $('#withdraw', el).addEventListener('click', () => {
      const body = document.createElement('div');
      body.innerHTML = `
        <p>탈퇴하면 이렇게 처리돼요.</p>
        <ul class="small"><li>살던 집은 빈집이 되고, 친구 관계가 정리돼요.</li><li>남은 몽글과 아이템은 사라지고 되돌릴 수 없어요.</li>
          <li>결제 기록은 관련 법령에 따라 정해진 기간 동안 분리 보관돼요.</li><li>보낸 쪽지는 ‘떠난 이웃’으로 표시돼요.</li></ul>
        ${acc.guest ? '' : '<label class="field"><span class="label">비밀번호 확인</span><input class="input" type="password" id="wpw" autocomplete="current-password" /></label>'}
        <label class="check"><input type="checkbox" id="wok" /> <span>안내를 모두 확인했어요.</span></label>`;
      openModal({
        title: '정말 마을을 떠나시나요?', body,
        actions: [{ label: '더 머무를래요', kind: 'primary' }, { label: '탈퇴하기', kind: 'danger', onClick: (close, btn) => {
          if (!$('#wok', body).checked) { toast('안내 확인에 체크해 주세요.', { kind: 'error' }); return; }
          quiet(run(btn, async () => {
            await Api.withdraw(acc.guest ? '' : $('#wpw', body).value);
            close(); toast('그동안 고마웠어요. 언제든 다시 놀러 와요.', { icon: 'heart' }); App.go('#/start');
          }));
        } }],
      });
    });
  };
  render();
};
