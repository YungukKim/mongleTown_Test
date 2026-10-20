// 토스페이먼츠 결제 승인 / 환불(관리자) Edge Function
// - 클라이언트가 보낸 금액은 믿지 않고, DB에 저장된 주문 금액과 비교한 뒤 승인 API를 호출한다.
// - 몽글 지급은 DB 함수 _confirm_grant 에서 주문당 한 번만 일어난다.
// - 승인 응답을 받지 못했거나 이미 승인된 결제면 토스에서 결제 상태를 다시 조회해 맞춘다.
// - 환불은 몽글 회수를 DB에 먼저 확정한 뒤 토스 취소를 부르고, 취소가 안 되면 회수를 되돌린다.
// - 시크릿 키는 TOSS_SECRET_KEY 시크릿으로 넣는다. 없으면 토스 문서용 공개 테스트 키를 쓴다(테스트 결제 전용).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DOCS_TEST_SECRET_KEY = "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";
const SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY") ?? DOCS_TEST_SECRET_KEY;
const TOSS_API = "https://api.tosspayments.com/v1/payments";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (code: string, message: string, status = 400) => json({ code, message }, status);

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// DB 함수가 올린 'CODE|문장' 오류를 나눈다
const dbError = (e: { message?: string }) => {
  const [code, ...rest] = (e.message ?? "").split("|");
  return rest.length ? fail(code, rest.join("|")) : fail("SERVER_ERROR", "잠시 문제가 생겼어요. 다시 시도해 주세요.", 500);
};

const auth = { Authorization: "Basic " + btoa(SECRET_KEY + ":") };

async function toss(path: string, body: unknown) {
  const res = await fetch(`${TOSS_API}${path}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

// 결제 상태 조회. 조회도 실패하면 null
async function lookup(paymentKey: string) {
  try {
    const res = await fetch(`${TOSS_API}/${encodeURIComponent(paymentKey)}`, { headers: auth });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function grant(orderId: string, paymentKey: string, payment: { method?: string; receipt?: { url?: string } }) {
  const { data, error } = await admin.rpc("_confirm_grant", {
    p_order: orderId,
    p_payment_key: paymentKey,
    p_method: payment?.method ?? null,
    p_receipt: payment?.receipt?.url ?? null,
  });
  if (error) return dbError(error);
  return json(data);
}

async function confirm(userId: string, p: { orderId?: string; paymentKey?: string; amount?: number | string }) {
  const { orderId, paymentKey } = p;
  if (!orderId || !paymentKey) return fail("INVALID", "결제 정보가 부족해요.");
  const { data: order } = await admin.from("payment_orders").select("*").eq("order_id", orderId).maybeSingle();
  if (!order || order.user_id !== userId) return fail("NOT_FOUND", "주문 정보를 찾지 못했어요.", 404);
  if (order.status === "DONE") {
    await admin.rpc("_payment_audit", { p_order: orderId, p_event: "DUPLICATE_CONFIRM", p_detail: "이미 승인된 주문에 승인 재요청" });
    return fail("ALREADY_PROCESSED", "이미 처리된 결제예요. 몽글은 한 번만 지급돼요.", 409);
  }
  if (order.status !== "READY") return fail("INVALID_STATE", "진행할 수 없는 주문이에요.");
  if (Number(p.amount) !== order.amount) {
    await admin.rpc("_confirm_fail", { p_order: orderId, p_reason: `결제 금액 불일치 (요청 ${p.amount} / 주문 ${order.amount})` });
    return fail("AMOUNT_MISMATCH", "결제 금액이 주문과 달라 결제를 진행하지 않았어요.");
  }

  const r = await toss("/confirm", { paymentKey, orderId, amount: order.amount });
  if (r.ok) return grant(orderId, paymentKey, r.data);

  // 앞선 요청이 승인까지 됐는데 지급 전에 끊긴 경우: 토스 쪽 결제가 이 주문으로 완료돼 있으면 지급한다
  const paid = await lookup(paymentKey);
  if (paid?.status === "DONE" && paid.orderId === orderId && paid.totalAmount === order.amount) {
    await admin.rpc("_payment_audit", { p_order: orderId, p_event: "CONFIRM_RECOVERED", p_detail: `${r.data?.code ?? r.status} 후 결제 조회로 지급` });
    return grant(orderId, paymentKey, paid);
  }
  const msg = r.data?.message ?? "결제 승인에 실패했어요.";
  await admin.rpc("_confirm_fail", { p_order: orderId, p_reason: `${r.data?.code ?? r.status} ${msg}` });
  return fail(r.data?.code ?? "CONFIRM_FAILED", msg, 400);
}

async function cancel(userId: string, p: { orderId?: string; reason?: string }) {
  const { data: acc } = await admin.from("accounts").select("role").eq("user_id", userId).maybeSingle();
  if (acc?.role !== "admin") return fail("FORBIDDEN", "관리자만 환불할 수 있어요.", 403);
  if (!p.orderId) return fail("INVALID", "주문번호가 없어요.");
  const reason = (p.reason ?? "").trim().slice(0, 200) || "관리자 환불";

  // 1) 잔액을 잠그고 유료 몽글을 먼저 회수해 둔다 (그 사이 사용으로 잔액이 음수가 되는 것을 막는다)
  const { data: order, error } = await admin.rpc("_refund_apply", { p_order: p.orderId, p_reason: reason, p_actor: userId });
  if (error) return dbError(error);

  // 2) 토스 결제 취소. 응답을 못 받았으면 결제 상태를 조회해서 판단한다
  let r: { ok: boolean; status: number; data: any };
  try {
    r = await toss(`/${encodeURIComponent(order.payment_key)}/cancel`, { cancelReason: reason });
  } catch (e) {
    r = { ok: false, status: 0, data: { message: String(e) } };
  }
  if (!r.ok) {
    const now = await lookup(order.payment_key);
    if (now?.status !== "CANCELED") {
      await admin.rpc("_refund_revert", { p_order: p.orderId, p_detail: `${r.data?.code ?? r.status} ${r.data?.message ?? ""}`, p_actor: userId });
      return fail(r.data?.code ?? "CANCEL_FAILED", r.data?.message ?? "결제 취소에 실패했어요. 회수한 몽글은 되돌렸어요.");
    }
  }
  await admin.rpc("_refund_done", { p_order: p.orderId, p_reason: reason, p_actor: userId });
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("METHOD", "POST만 받아요.", 405);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  // 정지·탈퇴 계정은 RPC와 똑같이 막는다
  const { data: prof } = await admin.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if (!prof) return fail("UNAUTHORIZED", "계정 정보를 찾지 못했어요.", 401);
  if (prof.status === "withdrawn") return fail("WITHDRAWN", "탈퇴한 계정이에요.", 403);
  if (prof.status === "suspended") return fail("SUSPENDED", "운영 정책에 따라 이용이 제한된 계정이에요. 고객센터로 문의해 주세요.", 403);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "confirm") return await confirm(user.id, body);
    if (body.action === "cancel") return await cancel(user.id, body);
    return fail("INVALID", "알 수 없는 요청이에요.");
  } catch (e) {
    console.error(e);
    return fail("SERVER_ERROR", "잠시 문제가 생겼어요. 다시 시도해 주세요.", 500);
  }
});
