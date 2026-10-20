/* =========================================================
   시작 · 로그인 · 회원가입 · 이메일 인증 · 비밀번호 재설정
   ========================================================= */

const HERO_ART = `
<svg class="hero-art wobble" viewBox="0 0 560 230" fill="#fff" stroke="#222" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M60 50c-12 0-16-14-6-19 0-12 16-15 21-7 5-11 22-9 24 2 10-2 15 9 8 15 3 6-2 9-8 9z" />
  <path d="M420 40c-10 0-13-11-5-15 0-10 13-12 17-6 4-9 18-7 19 2 8-2 12 7 6 12 2 5-2 7-6 7z" />
  <circle cx="500" cy="30" r="16" />
  <path d="M0 200 Q140 186 280 198 T560 194" fill="none" />
  <path d="M70 196v-62l45-38 45 38v62" /><path d="M58 140l57-52 57 52" fill="none"/><rect x="104" y="160" width="22" height="36" rx="4"/><rect x="80" y="140" width="18" height="16" rx="3"/><path d="M89 140v16M80 148h18" fill="none"/>
  <path d="M214 196V82q0-6 6-6h92q6 0 6 6v114" /><path d="M206 80h120" fill="none" />
  ${[0, 1, 2].map(r => [0, 1].map(c => `<rect x="${228 + c * 46}" y="${92 + r * 30}" width="30" height="20" rx="3"/>`).join('')).join('')}
  <rect x="254" y="168" width="24" height="28" rx="3"/>
  <path d="M386 196v-48q0-30 34-30t34 30v48" /><rect x="408" y="160" width="24" height="36" rx="10"/><circle cx="420" cy="140" r="7"/>
  <path d="M500 196v-30" fill="none"/><circle cx="500" cy="150" r="22"/><circle cx="486" cy="140" r="12"/><circle cx="514" cy="140" r="12"/>
  <path d="M30 196v-20" fill="none"/><circle cx="30" cy="164" r="16"/>
  <path d="M178 196v-26h18v26M172 170h30" /><path d="M178 178h18" fill="none"/>
</svg>`;

Pages.start = (el) => {
  el.innerHTML = `
    <section class="hero">
      ${HERO_ART}
      <h1>몽글마을<span class="bang">!</span></h1>
      <p class="tagline">오늘도 몽글몽글, 잘 지냈나요?</p>
      <div class="actions">
        <a class="btn primary lg" href="#/login">로그인</a>
        <a class="btn lg" href="#/signup">처음 왔어요 · 회원가입</a>
        <button class="btn ghost" type="button" id="guest">${icon('eye')}체험 계정으로 둘러보기</button>
      </div>
      <p class="demo-note">테스트 서비스예요. 충전은 토스페이먼츠 테스트 모드라 실제로 돈이 나가지 않아요.</p>
    </section>`;
  $('#guest', el).addEventListener('click', e => quiet(run(e.currentTarget, async () => {
    await Api.guestLogin();
    toast('체험 계정으로 입장했어요. 환영 선물 300몽글이 도착했어요!', { icon: 'sparkle' });
    App.go('#/village');
  })));
};

/* ---------- 로그인 ---------- */
Pages.login = (el, params) => {
  el.innerHTML = `
    <div class="auth-wrap">
      <h1>다시 만나서 반가워요</h1>
      <form class="card" id="login-form" novalidate>
        <div id="login-notice"></div>
        <label class="field"><span class="label">이메일</span>
          <input class="input" id="email" type="email" autocomplete="email" required value="${esc(params.email || '')}" /></label>
        <label class="field"><span class="label">비밀번호</span>
          <input class="input" id="pw" type="password" autocomplete="current-password" required /></label>
        <label class="check"><input type="checkbox" id="keep" checked /> <span>로그인 상태 유지</span></label>
        <button class="btn primary lg w-full mt-2" type="submit">마을로 들어가기</button>
        <p class="auth-foot"><a href="#/reset">비밀번호를 잊었어요</a></p>
      </form>
      <p class="auth-foot">아직 이웃이 아니라면? <a href="#/signup"><strong>회원가입</strong></a></p>
    </div>`;
  const form = $('#login-form', el);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const email = $('#email', el), pw = $('#pw', el);
    fieldError(email, /^\S+@\S+\.\S+$/.test(email.value) ? '' : '이메일 주소를 정확히 적어주세요. 예) mongle@example.com');
    fieldError(pw, pw.value ? '' : '비밀번호를 입력해 주세요.');
    if ($('[aria-invalid="true"]', form)) { $('[aria-invalid="true"]', form).focus(); return; }
    const btn = $('button[type=submit]', form);
    btn.classList.add('loading'); btn.disabled = true;
    Api.login({ email: email.value, password: pw.value, keep: $('#keep', el).checked })
      .then(() => { toast('어서 와요! 오늘도 몽글몽글.', { icon: 'heart' }); App.go('#/village'); })
      .catch(err => {
        const box = $('#login-notice', el);
        if (err.code === 'NOT_VERIFIED') {
          box.innerHTML = `<div class="notice">${icon('mail')}<div>${esc(err.message)}<br><a href="#/verify?email=${encodeURIComponent(err.extra.email)}">인증 메일 다시 보기</a></div></div>`;
        } else {
          box.innerHTML = `<div class="notice" role="alert">${icon('alert')}<div>${esc(err.message || '로그인하지 못했어요.')}</div></div>`;
          form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        }
      })
      .finally(() => { btn.classList.remove('loading'); btn.disabled = false; });
  });
};

/* ---------- 회원가입 ---------- */
Pages.signup = (el) => {
  let nickChecked = '';
  el.innerHTML = `
    <div class="auth-wrap">
      <div class="steps" aria-label="가입 단계"><span aria-current="step">① 정보 입력</span><span>›</span><span>② 이메일 인증</span><span>›</span><span>③ 집 고르기</span></div>
      <h1>몽글마을 주민 등록</h1>
      <form class="card" id="signup-form" novalidate>
        <label class="field"><span class="label">이메일</span>
          <input class="input" id="email" type="email" autocomplete="email" required />
          <span class="hint">인증 메일을 받을 주소예요. 다른 이웃에게는 보이지 않아요.</span></label>
        <label class="field"><span class="label">비밀번호</span>
          <input class="input" id="pw" type="password" autocomplete="new-password" required />
          <span class="hint">영문과 숫자를 섞어 8자 이상</span></label>
        <label class="field"><span class="label">비밀번호 확인</span>
          <input class="input" id="pw2" type="password" autocomplete="new-password" required /></label>
        <div class="field"><label class="label" for="nick">닉네임</label>
          <div class="input-row"><input class="input" id="nick" maxlength="10" autocomplete="nickname" required />
            <button class="btn sm" type="button" id="nick-check">중복 확인</button></div>
          <span class="hint">마을에서 불릴 이름 (2~10자, 한글·영문·숫자)</span>
          <span id="nick-result" aria-live="polite"></span></div>

        <label class="check"><input type="checkbox" id="minor" /> <span>만 14세 미만이에요</span></label>
        <div class="guardian-box" id="guardian" hidden>
          <p class="small mb-0">만 14세 미만은 보호자 동의가 필요해요. 보호자에게 동의 요청 메일을 보내고, 동의 전에는 유료 충전을 할 수 없어요.</p>
          <label class="field mt-1"><span class="label">보호자 이메일</span><input class="input" id="g-email" type="email" /></label>
        </div>

        <div class="agree-box" role="group" aria-label="약관 동의">
          <label class="check all"><input type="checkbox" id="agree-all" /> <span>모두 동의해요</span></label>
          <label class="check"><input type="checkbox" class="agree" data-req="1" /> <span>(필수) 이용약관 <button type="button" class="link-btn small" data-doc="이용약관">보기</button></span></label>
          <label class="check"><input type="checkbox" class="agree" data-req="1" /> <span>(필수) 개인정보 처리방침 <button type="button" class="link-btn small" data-doc="개인정보 처리방침">보기</button></span></label>
          <label class="check"><input type="checkbox" class="agree" data-req="1" /> <span>(필수) 유료 서비스 이용 정책 <button type="button" class="link-btn small" data-doc="유료 서비스 이용 정책">보기</button></span></label>
          <label class="check"><input type="checkbox" class="agree" id="agree-mkt" /> <span>(선택) 이벤트·소식 알림 받기</span></label>
        </div>
        <div id="agree-err" aria-live="polite"></div>
        <button class="btn primary lg w-full" type="submit">가입하기</button>
      </form>
      <p class="auth-foot">이미 주민이라면? <a href="#/login"><strong>로그인</strong></a></p>
    </div>`;

  const nickInput = $('#nick', el);
  const nickResult = $('#nick-result', el);
  nickInput.addEventListener('input', () => { nickChecked = ''; nickResult.innerHTML = ''; fieldError(nickInput, ''); });
  $('#nick-check', el).addEventListener('click', e => quiet(run(e.currentTarget, async () => {
    const v = nickInput.value.trim();
    try {
      const r = await Api.checkNickname(v);
      if (r.available) { nickChecked = v; fieldError(nickInput, ''); nickResult.innerHTML = `<span class="ok-text">${icon('check')}<span>‘${esc(v)}’ 쓸 수 있어요!</span></span>`; }
      else { nickChecked = ''; fieldError(nickInput, '이미 다른 이웃이 쓰고 있어요. 다른 이름은 어때요?'); }
    } catch (err) { fieldError(nickInput, err.message); }
  })));

  $('#minor', el).addEventListener('change', e => { $('#guardian', el).hidden = !e.target.checked; });
  const agrees = $$('.agree', el);
  $('#agree-all', el).addEventListener('change', e => agrees.forEach(a => { a.checked = e.target.checked; }));
  agrees.forEach(a => a.addEventListener('change', () => { $('#agree-all', el).checked = agrees.every(x => x.checked); }));
  $$('[data-doc]', el).forEach(b => b.addEventListener('click', ev => {
    ev.preventDefault();
    openModal({ title: b.dataset.doc, body: `<p class="muted">정식 약관 문서가 들어갈 자리예요. 법무 검토 후 내용을 채워주세요.</p><p class="small">· 수집 항목: 이메일, 닉네임, 비밀번호(암호화 저장)<br>· 실제 이름, 연락처 등은 수집하지 않아요.<br>· 탈퇴 시 관련 법령에 따른 보관 기간이 지나면 삭제해요.</p>`, actions: [{ label: '닫기', kind: 'primary' }] });
  }));

  $('#signup-form', el).addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#email', el), pw = $('#pw', el), pw2 = $('#pw2', el);
    fieldError(email, /^\S+@\S+\.\S+$/.test(email.value) ? '' : '이메일 주소를 정확히 적어주세요. 예) mongle@example.com');
    fieldError(pw, /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pw.value) ? '' : '영문과 숫자를 섞어 8자 이상으로 만들어 주세요.');
    fieldError(pw2, pw.value && pw.value === pw2.value ? '' : '두 비밀번호가 서로 달라요.');
    fieldError(nickInput, nickChecked && nickChecked === nickInput.value.trim() ? '' : '닉네임 중복 확인을 눌러주세요.');
    const minor = $('#minor', el).checked;
    const gEmail = $('#g-email', el);
    if (minor) fieldError(gEmail, /^\S+@\S+\.\S+$/.test(gEmail.value) ? '' : '보호자 이메일을 적어주세요.');
    else fieldError(gEmail, '');
    const reqOk = agrees.filter(a => a.dataset.req).every(a => a.checked);
    $('#agree-err', el).innerHTML = reqOk ? '' : `<div class="notice" role="alert">${icon('alert')}<div>필수 약관에 모두 동의해야 가입할 수 있어요.</div></div>`;
    const bad = $('[aria-invalid="true"]', el);
    if (bad || !reqOk) { (bad || $('#agree-all', el)).focus(); return; }
    const btn = $('button[type=submit]', el);
    try {
      const r = await run(btn, () => Api.signup({ email: email.value, password: pw.value, nickname: nickChecked, minor, guardianEmail: gEmail.value }));
      if (r.needsVerify) App.go('#/verify?email=' + encodeURIComponent(email.value.trim().toLowerCase()) + (minor ? '&minor=1' : ''));
      else { toast('가입이 끝났어요! 환영 선물 300몽글이 도착했어요.', { icon: 'sparkle' }); App.go('#/village'); }
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') fieldError(email, err.message);
      if (err.code === 'NICK_TAKEN') { nickChecked = ''; fieldError(nickInput, err.message); }
    }
  });
};


/* ---------- 이메일 인증 안내 ---------- */
Pages.verify = (el, params) => {
  const email = params.email || '';
  el.innerHTML = `
    <div class="auth-wrap">
      <div class="steps" aria-label="가입 단계"><span>① 정보 입력</span><span>›</span><span aria-current="step">② 이메일 인증</span><span>›</span><span>③ 집 고르기</span></div>
      <div class="card center">
        <div class="result-art">${icon('mail', 'class="wobble"')}</div>
        <h1>편지를 보냈어요!</h1>
        <p><strong>${esc(email)}</strong> 으로 인증 메일을 보냈어요.<br>메일 속 링크를 누르면 가입이 끝나고 바로 마을로 들어가요.</p>
        ${params.minor ? `<div class="notice">${icon('shield')}<div class="small" style="text-align:left">만 14세 미만은 보호자 동의가 확인된 뒤에 유료 충전을 할 수 있어요.</div></div>` : ''}
        <div class="notice">${icon('info')}<div class="small" style="text-align:left">링크는 이 브라우저에서 열어주세요. 메일이 안 보이면 스팸함도 확인해 주세요.</div></div>
        <button class="btn lg w-full" id="resend">${icon('mail')}인증 메일 다시 보내기</button>
        <p class="auth-foot small"><a href="#/login?email=${encodeURIComponent(email)}">이미 인증했어요 · 로그인</a></p>
      </div>
    </div>`;
  $('#resend', el).addEventListener('click', e => quiet(run(e.currentTarget, async () => {
    await Api.resendVerification(email);
    toast('인증 메일을 다시 보냈어요.', { icon: 'mail' });
  })));
};

/* ---------- 비밀번호 재설정 ---------- */
const PW_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

Pages.reset = (el, params) => {
  // 메일 속 링크로 돌아온 경우: 새 비밀번호 정하기
  if (params.mode === 'new') {
    if (!Api.me()) {
      el.innerHTML = `<div class="auth-wrap"><div class="card center">${emptyState('재설정 링크가 만료되었어요', '비밀번호 재설정을 다시 요청해 주세요.', 'lock')}<a class="btn primary" href="#/reset">다시 요청하기</a></div></div>`;
      return;
    }
    el.innerHTML = `
      <div class="auth-wrap">
        <h1>새 비밀번호 정하기</h1>
        <form class="card" id="newpw-form" novalidate>
          <label class="field"><span class="label">새 비밀번호</span><input class="input" id="npw" type="password" autocomplete="new-password" /><span class="hint">영문과 숫자를 섞어 8자 이상</span></label>
          <label class="field"><span class="label">새 비밀번호 확인</span><input class="input" id="npw2" type="password" autocomplete="new-password" /></label>
          <button class="btn primary lg w-full" type="submit">새 비밀번호 저장</button>
        </form>
      </div>`;
    $('#newpw-form', el).addEventListener('submit', e => {
      e.preventDefault();
      const npw = $('#npw', el), npw2 = $('#npw2', el);
      fieldError(npw, PW_RULE.test(npw.value) ? '' : '영문과 숫자를 섞어 8자 이상으로 만들어 주세요.');
      fieldError(npw2, npw.value === npw2.value ? '' : '두 비밀번호가 서로 달라요.');
      const bad = $('[aria-invalid="true"]', el);
      if (bad) return bad.focus();
      quiet(run($('button[type=submit]', el), async () => {
        await Api.updatePassword(npw.value);
        toast('비밀번호를 바꿨어요. 다시 만나서 반가워요!', { icon: 'lock' });
        App.go('#/village');
      }));
    });
    return;
  }

  el.innerHTML = `
    <div class="auth-wrap">
      <h1>비밀번호 다시 만들기</h1>
      <form class="card" id="reset-form" novalidate>
        <p class="muted">가입한 이메일을 적어주시면 재설정 링크를 보내드려요.</p>
        <label class="field"><span class="label">이메일</span><input class="input" id="email" type="email" autocomplete="email" /></label>
        <button class="btn primary lg w-full" type="submit">재설정 링크 받기</button>
      </form>
      <p class="auth-foot"><a href="#/login">로그인으로 돌아가기</a></p>
    </div>`;
  $('#reset-form', el).addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#email', el);
    fieldError(email, /^\S+@\S+\.\S+$/.test(email.value) ? '' : '이메일 주소를 정확히 적어주세요.');
    if (email.getAttribute('aria-invalid')) return email.focus();
    const r = await run($('button[type=submit]', el), () => Api.requestPasswordReset(email.value)).catch(() => null);
    if (!r) return;
    $('.card', el).innerHTML = `
      <div class="notice solid">${icon('mail')}<div>이 이메일로 가입된 계정이 있다면 재설정 링크를 보냈어요. 메일 속 링크를 이 브라우저에서 열어주세요.</div></div>
      <a class="btn w-full" href="#/login">로그인으로 돌아가기</a>`;
  });
};
