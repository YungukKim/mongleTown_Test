// 토스페이먼츠 결제 승인 / 환불(관리자) Edge Function
// - 클라이언트가 보낸 금액은 믿지 않고, DB에 저장된 주문 금액과 비교한 뒤 승인 API를 호출한다.
// - 몽글 지급은 DB 함수 _confirm_grant 에서 주문당 한 번만 일어난다.
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

async function toss(path: string, body: unknown) {
  const res = await fetch(`${TOSS_API}${path}`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(SECRET_KEY + ":"), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
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
  if (!r.ok) {
    const msg = r.data?.message ?? "결제 승인에 실패했어요.";
    await admin.rpc("_confirm_fail", { p_order: orderId, p_reason: `${r.data?.code ?? r.status} ${msg}` });
    return fail(r.data?.code ?? "CONFIRM_FAILED", msg, 400);
  }
  const { data, error } = await admin.rpc("_confirm_grant", {
    p_order: orderId,
    p_payment_key: paymentKey,
    p_method: r.data?.method ?? null,
    p_receipt: r.data?.receipt?.url ?? null,
  });
  if (error) return dbError(error);
  return json(data);
}

async function cancel(userId: string, p: { orderId?: string; reason?: string }) {
  const { data: acc } = await admin.from("accounts").select("role").eq("user_id", userId).maybeSingle();
  if (acc?.role !== "admin") return fail("FORBIDDEN", "관리자만 환불할 수 있어요.", 403);
  const reason = (p.reason ?? "").trim() || "관리자 환불";
  const { data: order, error } = await admin.rpc("_refund_check", { p_order: p.orderId });
  if (error) return dbError(error);
  const r = await toss(`/${encodeURIComponent(order.payment_key)}/cancel`, { cancelReason: reason });
  if (!r.ok) return fail(r.data?.code ?? "CANCEL_FAILED", r.data?.message ?? "결제 취소에 실패했어요.");
  const { error: e2 } = await admin.rpc("_refund_apply", { p_order: p.orderId, p_reason: reason, p_actor: userId });
  if (e2) return dbError(e2);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("METHOD", "POST만 받아요.", 405);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
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
