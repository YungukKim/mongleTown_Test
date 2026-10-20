/* =========================================================
   외부 서비스 설정 (모두 브라우저에 공개돼도 되는 값만 둔다)
   - Supabase publishable 키는 공개용 키다. 데이터 보호는 RLS와 RPC 권한 검사가 맡는다.
   - 토스 클라이언트 키는 결제위젯용 공개 키다. 시크릿 키는 Supabase Edge Function 에만 있다.
   ========================================================= */
const CONFIG = {
  SUPABASE_URL: 'https://tqphknyocwoxzmbpckhu.supabase.co',
  SUPABASE_KEY: 'sb_publishable_JqYeJdRRiJHjeP8EGpbq2A_8xXJ_Izo',
  // 토스페이먼츠 문서용 공개 테스트 키 (결제위젯). 내 개발자센터 테스트 키로 바꿔도 된다.
  TOSS_CLIENT_KEY: 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm',
};
