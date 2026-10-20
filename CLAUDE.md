# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

몽글마을! — 집을 고르고 방을 꾸미고 이웃과 쪽지를 나누는 웹 힐링 소셜 게임. 프런트는 빌드 없는 HTML·CSS·순수 JS(Vercel 정적 배포), 백엔드는 Supabase(Auth·Postgres·RPC·Edge Function), 결제는 토스페이먼츠 결제위젯 v2 테스트 모드. 배포·Supabase Auth 설정 절차는 README.md에 있다.

## 실행 / 확인

- 빌드·린트·테스트 도구는 없다 (package.json 없음). 이 PC에는 Node가 없고 `python`은 WindowsApps 껍데기라 실행되지 않는다. 일괄 수정은 Bash(sed·heredoc)로 한다.
- 로컬 서버: `powershell -ExecutionPolicy Bypass -File serve.ps1` → http://localhost:5173 (캐시 끔). 미리보기 패널용 `.claude/launch.json`(`mongle`, powershell로 serve.ps1 실행, 5173 포트)은 gitignore 대상이라 새로 받은 저장소에는 없으니 다시 만든다. `file://`로 열면 정적 스냅샷만 보인다.
- 로컬도 운영과 같은 Supabase 프로젝트(`tqphknyocwoxzmbpckhu`, mongletown)를 쓴다. 테스트 관리자 계정은 git에서 제외된 `test-accounts.local.md`에 있다.
- 확인은 브라우저에서 `Api.*`를 직접 호출하거나 화면을 눌러 본다. 스크립트를 고친 뒤에는 해시만 바꾸지 말고 페이지를 새로고침해야 반영된다.
- Supabase Auth 설정(익명 로그인 = 체험 계정, Confirm email, Site/Redirect URL)은 MCP로 바꿀 수 없다. 대시보드에서 사용자가 직접 바꿔야 하고, 기본값은 익명 로그인이 꺼져 있다.
- 테스트 계정이 더 필요하면 MCP `execute_sql`로 `auth.users`(비밀번호는 `extensions.crypt(pw, extensions.gen_salt('bf'))`, `email_confirmed_at = now()`, 토큰 컬럼은 '')와 `auth.identities`(provider 'email', `provider_id = user_id::text`)를 함께 넣는다. 가입 트리거가 프로필과 기본 아이템을 만든다. 비밀번호는 `test-accounts.local.md`에만 적는다.
- 토스 결제창은 다른 도메인의 iframe이라 DOM으로 읽을 수 없다. 카드 결제를 끝까지 하는 확인은 사용자에게 맡긴다.
- 이 PC에는 git user.name/email이 설정되어 있지 않다. 커밋할 때 `git -c user.name=YungukKim -c user.email=<사용자 이메일> commit ...` 형식으로 지정한다.

## 프런트엔드 구조

- **ES 모듈이 아니다.** `index.html`의 `<script>` 순서대로 전역(`CONFIG`, `ITEMS`, `HOMES`, `Store`, `Api`, `Bus`, `Pages`, `App`, `$`, `esc`, `icon` …)을 공유한다. 새 파일은 index.html에 순서를 맞춰 추가한다.
- **`js/api.js`가 유일한 데이터 계층.** 화면은 Supabase를 직접 부르지 않고 `Api`만 쓴다.
  - `Api.me()`, `myAccount()`, `unreadCount()`, `pendingFriendCount()`, `balanceSync()`는 `my_account` RPC 결과를 캐시해 **동기로** 돌려준다. 나머지는 모두 async다.
  - 데이터를 바꾸는 호출은 `after()`로 감싸 캐시를 다시 받고 `Bus.emit('data')`를 보낸다. 상단 배지·잔액은 이 이벤트로 다시 그려진다. 20초마다 폴링해서 새 쪽지·친구 요청 토스트를 띄운다.
  - 서버 오류는 `'CODE|사용자 문장'` 형식이고, `ApiError(code, message)`로 바뀐다. 화면의 `run(btn, fn)`이 로딩 표시와 오류 토스트를 처리한다.
- **라우터(`js/app.js`)는 해시 기반**이다(`#/room/:userId`). `Pages[name](el, params)`는 정리 함수를 돌려줄 수 있다.
  - `#main`(el)은 화면끼리 재사용된다. el 자체에 단 리스너는 정리 함수에서 반드시 떼야 한다.
  - `App.leaveGuard`는 저장 안 한 방 꾸미기를 지키는 장치다.
- **외부에서 돌아오는 경로는 해시가 아니라 쿼리**다. `App.consumeUrlParams()`가 처리한 뒤 주소를 정리한다.
  - 토스: `?pay=success|fail&paymentKey&orderId&amount` → `App.pendingPay` → 충전 화면이 승인 처리
  - Supabase 메일 링크(PKCE): `?auth=verified|recovery&code=`
- **카탈로그는 두 곳에 나뉘어 있다.**
  - 아이템 그림·크기(`js/data.js`의 `ITEMS`)와 집 좌표(`HOMES`)는 클라이언트에만 있다.
  - 가격·판매 여부·소유는 DB `items`·`homes` 테이블에 있다. `getItem(id)`가 `Store.itemMeta`(서버 가격)와 합친다.
  - **아이템이나 집을 추가하면 data.js와 DB 시드를 둘 다 바꿔야 한다.**
- **방 좌표**는 방 크기 대비 %(가로:세로 3:2)다. `placed` 배열은 `{instId, itemId, x, y, rot, flip, z}`이고, 서버가 `itemId`를 `user_items`에서 다시 채운다.

## 백엔드 구조 (Supabase)

- **모든 public 테이블은 RLS ON + 정책 없음**(직접 접근 거부)이다. 예외는 `items`, `charge_products`의 읽기 정책뿐이다. 읽기·쓰기는 모두 `security definer` RPC로 한다.
  - 함수 첫 줄에서 `_uid()`(로그인·정지·탈퇴 검사)나 `_require_admin()`을 부른다.
  - 결과는 jsonb이고, 키는 프런트가 쓰는 camelCase다(관리자 목록 일부는 `to_jsonb`라 snake_case).
- **함수 권한 규칙**
  - 이름이 `_`로 시작하는 함수는 내부·서비스 키 전용이다: `revoke ... from public, anon, authenticated` 후 `service_role`에만 `grant`한다.
  - 나머지는 `authenticated`에만 `grant`한다. 익명 사용자에게 열린 것은 `nickname_available` 하나뿐이다.
  - 새 함수는 기본적으로 PUBLIC 실행 권한이 붙으므로, 만들 때마다 같은 revoke/grant를 함께 넣는다.
- **회원가입 트리거** `on_auth_user_created` → `_handle_new_user`가 다음을 한 번에 만든다.
  - `profiles`(공개 정보), `accounts`(역할·보호자 동의 등 비공개)
  - `_grant_starter`: 기본 가구, 300 무료 몽글, 빈 방, 데모 이웃의 환영 쪽지·친구 요청·좋아요
- **데모 이웃(NPC)** 6명은 고정 UUID `00000000-0000-4000-8000-00000000000{1..6}`이고 `auth.users` 없이 `profiles.is_npc`만 있다.
  - 친구 요청은 즉시 수락한다.
  - 쪽지 답장은 `created_at = now() + 4초`로 미리 넣어 두고, 조회 함수가 미래 시각 쪽지를 숨긴다.
- **재화는 원장(`wallet_transactions`)의 합**이다(`_balance`). `paid`와 `free`를 따로 기록하고, 구매 때는 무료 몽글부터 쓴다. 원장은 지우지 않는다.
- **결제 흐름**
  1. `create_order` RPC가 서버 상품표 금액으로 주문을 만든다.
  2. 토스 위젯 `requestPayment`로 결제를 요청한다.
  3. Edge Function `toss-payments`(`action: confirm`)가 처리한다.
     - DB 주문 금액과 비교한 뒤 토스 승인 API를 호출한다.
     - 승인되면 `_confirm_grant`가 주문을 잠그고 한 번만 지급한다.
  4. 관리자 환불은 같은 함수의 `action: cancel`이다.
  - 시크릿 키는 Edge Function 시크릿 `TOSS_SECRET_KEY`에 둔다. 없으면 토스 문서용 공개 테스트 키를 쓴다. 클라이언트 키는 `js/config.js`에 있다.
- **변경 방법**
  - 스키마 변경은 Supabase MCP `apply_migration`으로 적용한다. 적용한 SQL은 `supabase/migrations/<version>_<name>.sql`로 저장소에도 남긴다(기존 파일은 이미 적용된 기록이다).
  - 적용된 SQL 원문은 `supabase_migrations.schema_migrations.statements`에 있다. `execute_sql`의 JSON 출력은 역슬래시를 두 번 써서 보여주므로(`E'\\n'`) 파일로 옮길 때 하나로 되돌린다.
  - Edge Function은 `supabase/functions/toss-payments/index.ts`를 고친 뒤 MCP `deploy_edge_function`으로 배포한다(`verify_jwt: true`).

## 디자인·문구 규칙 (PRD)

- 흰 바탕 + 검은 연필 선화, 둥글고 살짝 비뚤어진 테두리(`--radius-a/b`, `.wobble` SVG 필터)를 쓴다. 색은 쓰지 않는다.
- **상태를 색으로만 구분하지 않는다.** 빈집은 점선, 내 집은 ★·검정 채움, 좋아요는 채운 하트와 "좋아요 취소" 글자처럼 모양이나 글자로도 보여준다.
- UI 문구는 따뜻한 해요체로 쓴다. 되돌리기 어려운 동작(구매·이사·친구 끊기·탈퇴 등)에는 `confirmDialog`를 띄운다.
- 키보드 조작과 `aria-label`을 유지하고, 움직임 줄이기 설정(`html.reduce-motion`)을 지킨다.
- 커밋 메시지는 한국어로 쓴다.
