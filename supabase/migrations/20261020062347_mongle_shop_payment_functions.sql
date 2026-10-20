-- 읽지 않은 쪽지 수에서 아직 도착하지 않은(예약된) 답장은 빼기
create or replace function public.my_account() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid(); r jsonb;
begin
  select jsonb_build_object(
    'id', p.id,
    'email', (select email from auth.users where id = u),
    'role', a.role, 'guest', a.is_guest, 'minor', a.minor, 'guardianConsent', a.guardian_consent,
    'profile', jsonb_build_object('nickname', p.nickname, 'bio', p.bio, 'bioPublic', p.bio_public, 'friendsPublic', p.friends_public, 'msgFrom', p.msg_from),
    'home', (select _home_json(h.id) from homes h where h.occupant = u),
    'balance', _balance(u),
    'unread', (select count(*) from messages m where m.to_id = u and m.read_at is null and not m.del_by_recipient and m.created_at <= now()
                 and not exists (select 1 from blocks b where b.by_id = u and b.target_id = m.from_id)),
    'pendingFriends', (select count(*) from friendships f where f.to_id = u and f.status = 'pending'))
  into r
  from profiles p left join accounts a on a.user_id = p.id where p.id = u;
  return r;
end $$;

/* ================= 상점 ================= */

create or replace function public.get_shop() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return (select jsonb_agg(jsonb_build_object('id', i.id, 'price', i.price, 'sale', i.sale, 'stack', i.stack,
            'owned', (select count(*) from user_items ui where ui.user_id = u and ui.item_id = i.id)) order by i.id)
          from items i where not (i.starter and i.price = 0));
end $$;

-- 구매: 사용자별 잠금 → 잔액 확인 → 차감 + 지급을 한 트랜잭션에서. 같은 idem_key는 한 번만 처리.
create or replace function public.buy_item(p_item text, p_idem_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); it items; prev purchases; bal jsonb; use_free int; use_paid int; inst uuid; pid uuid;
begin
  perform pg_advisory_xact_lock(hashtext('wallet:' || u::text));
  select * into prev from purchases where user_id = u and idem_key = p_idem_key;
  if found then
    return jsonb_build_object('purchaseId', prev.id, 'instId', prev.inst_id, 'balance', _balance(u), 'replayed', true);
  end if;
  select * into it from items where id = p_item;
  if not found or not it.sale then raise exception 'NOT_FOR_SALE|지금은 판매하지 않는 아이템이에요.'; end if;
  if not it.stack and exists (select 1 from user_items where user_id = u and item_id = p_item) then
    raise exception 'ALREADY_OWNED|이미 가지고 있는 아이템이에요. 이 아이템은 하나만 가질 수 있어요.';
  end if;
  bal := _balance(u);
  if (bal->>'total')::int < it.price then raise exception 'INSUFFICIENT|몽글이 부족해요.'; end if;
  use_free := least((bal->>'free')::int, it.price);
  use_paid := it.price - use_free;
  insert into user_items (user_id, item_id, source) values (u, p_item, 'purchase') returning id into inst;
  insert into purchases (user_id, item_id, price, inst_id, idem_key) values (u, p_item, it.price, inst, p_idem_key) returning id into pid;
  insert into wallet_transactions (user_id, type, paid, free, ref, reason) values (u, 'purchase', -use_paid, -use_free, pid::text, it.name || ' 구매');
  return jsonb_build_object('purchaseId', pid, 'instId', inst, 'balance', _balance(u), 'replayed', false);
end $$;

create or replace function public.get_history() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return jsonb_build_object(
    'tx', (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'paid', paid, 'free', free, 'reason', reason, 'orderId', order_id, 'at', created_at) order by created_at desc), '[]'::jsonb)
           from wallet_transactions where user_id = u),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('orderId', order_id, 'productName', product_name, 'amount', amount, 'coins', coins, 'status', status,
                 'method', method, 'failReason', fail_reason, 'createdAt', created_at, 'receiptUrl', receipt_url) order by created_at desc), '[]'::jsonb)
               from payment_orders where user_id = u));
end $$;

/* ================= 충전 (토스페이먼츠) ================= */

-- 1) 서버가 주문을 만든다. 금액은 서버의 상품표 기준.
create or replace function public.create_order(p_product text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p charge_products; a accounts; oid text;
begin
  select * into p from charge_products where id = p_product and sale;
  if not found then raise exception 'NOT_FOUND|판매 중인 충전 상품이 아니에요.'; end if;
  select * into a from accounts where user_id = u;
  if a.minor and not a.guardian_consent then raise exception 'GUARDIAN_REQUIRED|보호자 동의가 확인된 뒤에 충전할 수 있어요.'; end if;
  oid := 'MONGLE-' || to_char(now() at time zone 'Asia/Seoul', 'YYMMDDHH24MISS') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into payment_orders (order_id, user_id, product_id, product_name, amount, coins) values (oid, u, p.id, p.name, p.price, p.coins);
  insert into payment_audit (order_id, event, detail) values (oid, 'ORDER_CREATED', p.name || ' ' || p.price || '원');
  return jsonb_build_object('orderId', oid, 'amount', p.price, 'orderName', p.name, 'coins', p.coins);
end $$;

-- 결제창에서 실패·취소된 경우
create or replace function public.fail_order(p_order text, p_code text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); st text;
begin
  st := case when p_code in ('PAY_PROCESS_CANCELED', 'USER_CANCEL') then 'CANCELED' else 'FAILED' end;
  update payment_orders set status = st, fail_reason = left(coalesce(p_message, p_code), 200)
  where order_id = p_order and user_id = u and status = 'READY';
  if found then insert into payment_audit (order_id, event, detail) values (p_order, 'PAYMENT_' || st, left(p_code || ' ' || coalesce(p_message, ''), 300)); end if;
end $$;

-- 아래 세 함수는 Edge Function(서비스 키)만 호출한다.
create or replace function public._payment_audit(p_order text, p_event text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into payment_audit (order_id, event, detail) values (p_order, p_event, left(p_detail, 500));
$$;

create or replace function public._confirm_fail(p_order text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update payment_orders set status = 'FAILED', fail_reason = left(p_reason, 200) where order_id = p_order and status = 'READY';
  insert into payment_audit (order_id, event, detail) values (p_order, 'CONFIRM_FAILED', left(p_reason, 500));
end $$;

-- 승인 성공한 주문에 대해 한 번만 몽글 지급
create or replace function public._confirm_grant(p_order text, p_payment_key text, p_method text, p_receipt text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o payment_orders;
begin
  select * into o from payment_orders where order_id = p_order for update;
  if not found then raise exception 'NOT_FOUND|주문 정보를 찾지 못했어요.'; end if;
  if o.granted then
    insert into payment_audit (order_id, event, detail) values (p_order, 'DUPLICATE_GRANT_BLOCKED', '이미 지급된 주문');
    return jsonb_build_object('order', to_jsonb(o), 'balance', _balance(o.user_id), 'replayed', true);
  end if;
  update payment_orders set status = 'DONE', payment_key = p_payment_key, method = p_method, receipt_url = p_receipt,
    approved_at = now(), granted = true, fail_reason = null
  where order_id = p_order returning * into o;
  insert into wallet_transactions (user_id, type, paid, order_id, reason) values (o.user_id, 'charge', o.coins, o.order_id, o.product_name || ' 충전');
  insert into payment_audit (order_id, event, detail) values (p_order, 'PAYMENT_APPROVED', o.amount || '원 ' || coalesce(p_method, ''));
  insert into payment_audit (order_id, event, detail) values (p_order, 'COINS_GRANTED', o.coins || '몽글');
  return jsonb_build_object('order', to_jsonb(o), 'balance', _balance(o.user_id), 'replayed', false);
end $$;

-- 환불 전 확인: 이미 사용한 유료 몽글이 있으면 자동 환불 불가
create or replace function public._refund_check(p_order text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o payment_orders; bal jsonb;
begin
  select * into o from payment_orders where order_id = p_order;
  if not found or o.status <> 'DONE' then raise exception 'INVALID_STATE|승인 완료된 주문만 환불할 수 있어요.'; end if;
  bal := _balance(o.user_id);
  if (bal->>'paid')::int < o.coins then
    raise exception 'COINS_USED|이미 사용한 유료 몽글이 있어 자동 환불할 수 없어요. (보유 유료 % / 회수 필요 %)', bal->>'paid', o.coins;
  end if;
  return to_jsonb(o);
end $$;

create or replace function public._refund_apply(p_order text, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o payment_orders;
begin
  update payment_orders set status = 'REFUNDED', refunded_at = now(), refund_reason = p_reason
  where order_id = p_order and status = 'DONE' returning * into o;
  if not found then raise exception 'INVALID_STATE|이미 처리된 주문이에요.'; end if;
  insert into wallet_transactions (user_id, type, paid, order_id, reason, actor) values (o.user_id, 'refund', -o.coins, p_order, '환불 회수: ' || p_reason, p_actor);
  insert into payment_audit (order_id, event, detail) values (p_order, 'REFUNDED', p_reason);
  insert into admin_log (actor, action, target, detail) values (p_actor, 'REFUND', p_order, p_reason);
end $$;

/* ================= 관리자 ================= */

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return jsonb_build_object(
    'users', (select count(*) from profiles where not is_npc),
    'residents', (select count(*) from homes where occupant is not null),
    'homes', (select count(*) from homes),
    'openReports', (select count(*) from reports where status = 'open'),
    'revenue', (select coalesce(sum(amount), 0) from payment_orders where status = 'DONE'),
    'messages', (select count(*) from messages));
end $$;

create or replace function public.admin_users() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'email', coalesce(au.email, case when a.is_guest then '(체험 계정)' else '-' end), 'nickname', p.nickname, 'status', p.status,
      'npc', p.is_npc, 'guest', coalesce(a.is_guest, false), 'minor', coalesce(a.minor, false), 'guardianConsent', coalesce(a.guardian_consent, false),
      'role', coalesce(a.role, 'user'), 'createdAt', p.created_at,
      'home', coalesce((select name from homes where occupant = p.id), '-'), 'balance', (_balance(p.id)->>'total')::int) order by p.created_at desc), '[]'::jsonb)
    from profiles p left join accounts a on a.user_id = p.id left join auth.users au on au.id = p.id);
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  if p_status not in ('active', 'suspended') then raise exception 'INVALID|잘못된 상태예요.'; end if;
  if p_user = me then raise exception 'INVALID|내 계정은 바꿀 수 없어요.'; end if;
  update profiles set status = p_status where id = p_user and status <> 'withdrawn';
  insert into admin_log (actor, action, target, detail) values (me, 'USER_STATUS', p_user::text, p_status);
end $$;

create or replace function public.admin_set_guardian_consent(p_user uuid, p_consent boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  update accounts set guardian_consent = p_consent where user_id = p_user;
  insert into admin_log (actor, action, target, detail) values (me, 'GUARDIAN_CONSENT', p_user::text, p_consent::text);
end $$;

create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'at', r.created_at, 'reporterName', _nick(r.reporter), 'targetName', _nick(r.target_id),
            'reason', r.reason, 'detail', r.detail, 'snapshot', r.snapshot, 'status', r.status, 'note', r.note) order by r.created_at desc), '[]'::jsonb)
          from reports r);
end $$;

create or replace function public.admin_resolve_report(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  if p_status not in ('resolved', 'dismissed') then raise exception 'INVALID|잘못된 상태예요.'; end if;
  update reports set status = p_status, note = p_note, resolved_at = now(), resolved_by = me where id = p_id;
  insert into admin_log (actor, action, target, detail) values (me, 'REPORT_' || upper(p_status), p_id::text, p_note);
end $$;

create or replace function public.admin_update_item(p_id text, p_price int, p_sale boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  update items set price = greatest(0, p_price), sale = p_sale where id = p_id;
  insert into admin_log (actor, action, target, detail) values (me, 'ITEM_UPDATE', p_id, p_price || '/' || p_sale);
end $$;

create or replace function public.admin_products() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return (select jsonb_agg(to_jsonb(p) order by sort) from charge_products p);
end $$;

create or replace function public.admin_update_product(p_id text, p_price int, p_coins int, p_sale boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  update charge_products set price = greatest(100, p_price), coins = greatest(1, p_coins), sale = p_sale where id = p_id;
  insert into admin_log (actor, action, target, detail) values (me, 'PRODUCT_UPDATE', p_id, p_price || '/' || p_coins || '/' || p_sale);
end $$;

create or replace function public.admin_orders() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return (select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object('nickname', _nick(o.user_id)) order by o.created_at desc), '[]'::jsonb)
          from (select * from payment_orders order by created_at desc limit 300) o);
end $$;

create or replace function public.admin_audit() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return (select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc), '[]'::jsonb) from (select * from payment_audit order by id desc limit 100) a);
end $$;

create or replace function public.admin_ledger() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('nickname', _nick(t.user_id), 'actorName', case when t.actor is null then null else _nick(t.actor) end) order by t.created_at desc), '[]'::jsonb)
          from (select * from wallet_transactions order by created_at desc limit 300) t);
end $$;

-- 관리자 조정은 무료 몽글로만, 사유 필수. 원장은 지우지 않고 반대 조정으로만 바로잡는다.
create or replace function public.admin_adjust(p_user uuid, p_amount int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  if coalesce(p_amount, 0) = 0 then raise exception 'INVALID|조정할 수량을 입력해 주세요.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'INVALID|조정 사유는 꼭 남겨야 해요.'; end if;
  if p_amount < 0 and (_balance(p_user)->>'free')::int + p_amount < 0 then raise exception 'INVALID|회수량이 무료 재화 잔액보다 많아요.'; end if;
  insert into wallet_transactions (user_id, type, free, reason, actor) values (p_user, 'admin', p_amount, trim(p_reason), me);
  insert into admin_log (actor, action, target, detail) values (me, 'WALLET_ADJUST', p_user::text, p_amount || ' ' || p_reason);
end $$;

create or replace function public.admin_homes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin();
  return (select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'name', name, 'available', available,
            'occupant', case when occupant is null then null else _nick(occupant) end) order by kind desc, no) from homes);
end $$;

create or replace function public.admin_set_home_available(p_id text, p_available boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  update homes set available = p_available where id = p_id and occupant is null;
  insert into admin_log (actor, action, target, detail) values (me, 'HOME_AVAILABLE', p_id, p_available::text);
end $$;

/* ================= 실행 권한 정리 ================= */
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like '\_%' then
      execute format('grant execute on function %s to service_role', f.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;
grant execute on function public.nickname_available(text) to anon;
