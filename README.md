# 몽글마을!

바쁜 하루 끝에, 서로의 안부를 묻는 작은 마을. 집을 고르고 방을 꾸미고, 이웃과 쪽지를 나누는 웹 힐링 소셜 게임이에요.

- **프런트엔드**: HTML · CSS · 순수 JS (빌드 없음) → **Vercel** 정적 배포
- **백엔드**: **Supabase** (Auth, PostgreSQL, RPC 함수, Edge Function)
- **결제**: **토스페이먼츠** 결제위젯 v2 (테스트 모드)

## 구조

```
index.html                 앱 셸
css/style.css              연필 선화 디자인 시스템
js/config.js               Supabase URL·publishable 키, 토스 클라이언트 키 (공개돼도 되는 값만)
js/data.js                 아이템 그림·집 좌표 등 화면용 카탈로그
js/store.js                기기별 설정, 아이템 가격 캐시
js/api.js                  Supabase 호출 계층 (화면은 이것만 사용)
js/pages/*.js              화면별 코드
supabase/migrations/       DB 스키마·시드·RPC 함수 (이미 mongletown 프로젝트에 적용됨)
supabase/functions/toss-payments/   결제 승인·환불 Edge Function
about.html · faq.html      검색·AI가 읽는 정적 소개·FAQ 페이지 (구조화 데이터 포함)
robots.txt · sitemap.xml · llms.txt   크롤러·AI 답변 엔진용 파일
og-image.png · icon-512.png · favicon.svg · site.webmanifest   공유 미리보기·아이콘
vercel.json                Vercel 헤더·cleanUrls 설정
```

## 서버에서 지키는 규칙

클라이언트는 테이블에 직접 쓰지 않아요. 모든 테이블에 RLS를 켜고, 데이터 변경은 `security definer` RPC 함수로만 해요. 함수마다 로그인 사용자를 확인하고 게임 규칙을 검사해요.

- **입주·이사**: 행 잠금으로 같은 집에 두 명이 입주하지 못하게 막고, 이전 집 비우기와 새 집 점유를 한 트랜잭션에서 처리
- **방 저장**: 보유하지 않은 가구, 같은 가구 중복 배치, 방 밖 좌표를 거절
- **구매**: 사용자별 잠금 → 잔액 확인 → 차감·지급을 한 트랜잭션에서 처리. 멱등 키로 중복 차감을 막고, 무료 몽글부터 사용
- **재화**: 잔액은 원장(`wallet_transactions`)의 합. 관리자 조정은 사유가 필수이고 원장은 지우지 않음
- **결제**
  1. 서버(`create_order`)가 상품표 금액으로 주문을 만듦
  2. 토스 결제위젯으로 결제를 요청함
  3. `successUrl`로 돌아오면 Edge Function이 DB 주문 금액과 비교한 뒤 토스 승인 API를 호출함
  4. 승인에 성공한 주문에만 몽글을 **한 번** 지급하고, 모든 단계를 `payment_audit`에 기록함
- **환불(관리자)**: 회수할 유료 몽글이 남아 있을 때만 토스 결제 취소 API를 호출하고 몽글을 회수
- **쪽지·친구**: 500자 제한, 분당 5건 제한, 수신 범위(모두/친구만/받지 않음), 차단, 친구 요청 중복 방지, 거절 후 24시간 재요청 제한
- **관리자**: `accounts.role = 'admin'`인 계정만 운영 도구 RPC를 실행할 수 있음

데모 이웃 6명(구름이, 솜사탕 등)이 미리 살고 있어요. 이웃에게 친구 요청을 보내면 바로 수락하고, 쪽지를 보내면 몇 초 뒤 답장이 와요.

## 처음 한 번 해야 할 설정

### 1. Vercel 배포
1. [vercel.com/new](https://vercel.com/new)에서 이 GitHub 저장소를 Import 해요.
2. Framework Preset은 **Other**, Build Command와 Output Directory는 비워 두고 Deploy를 눌러요.
3. 이후 `main`에 push하면 자동으로 다시 배포돼요.

### 2. Supabase Auth 설정 (대시보드 → Authentication)
- **URL Configuration**: Site URL을 Vercel 주소(예: `https://mongletown.vercel.app`)로 바꾸고, Redirect URLs에 아래 두 주소를 추가해요.
  - `https://<Vercel 주소>/**`
  - `http://localhost:5173/**`

  이걸 해야 인증 메일과 비밀번호 재설정 링크가 앱으로 돌아와요.
- **체험 계정**: Sign In / Providers에서 **Allow anonymous sign-ins**를 켜면 시작 화면의 "체험 계정으로 둘러보기"가 동작해요.
- **이메일**: 기본 메일 발송은 Supabase 조직 멤버 주소로만, 시간당 몇 통만 보내져요. 다른 사람에게 테스트를 맡기려면 아래 중 하나를 해야 해요.
  - Email 공급자에서 **Confirm email**을 끄기
  - SMTP 설정에 자체 메일 서버를 연결하기

### 3. 관리자 지정
가입한 계정을 관리자로 만들려면 Supabase SQL Editor에서 아래를 실행해요.
```sql
update public.accounts set role = 'admin'
where user_id = (select id from auth.users where email = '관리자 이메일');
```

### 4. 토스페이먼츠 키 (선택)
지금은 토스 개발자센터 문서에 공개된 **결제위젯 테스트 키**를 쓰고 있어요. 실제 돈은 나가지 않아요. 내 테스트 키로 바꾸려면 아래 두 곳을 고쳐요.
- `js/config.js`의 `TOSS_CLIENT_KEY`
- Supabase 대시보드 → Edge Functions → Secrets의 `TOSS_SECRET_KEY`

시크릿 키는 프런트엔드에 넣지 마세요.

## 로컬 실행

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```
http://localhost:5173 을 열어요. 로컬도 같은 Supabase 프로젝트를 써요.

## 알려진 제한

- 탈퇴한 이메일로는 다시 가입할 수 없어요. 계정은 '탈퇴' 상태로 남아요.
- 만 14세 미만 보호자 동의는 실제 확인 절차가 없어요. 관리자가 운영 도구에서 동의를 확인 처리해야 충전할 수 있어요.
- 새 쪽지와 친구 요청은 20초마다 확인해요. 실시간 알림은 아직 없어요.
