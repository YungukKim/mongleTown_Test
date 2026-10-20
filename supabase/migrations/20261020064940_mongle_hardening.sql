-- 백엔드 점검 후 보강: 입력 검증, 신고 위조 방지, 탈퇴 이웃 정보 숨김, 체험 계정 충전 차단, 환불 경쟁 상태 수정

-- 가입 닉네임도 마이페이지와 같은 규칙(2~10자, 한글·영문·숫자·밑줄)으로 검사. minor 값이 이상해도 가입은 막지 않는다.
create or replace function public._handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  want text := nullif(trim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');
  nick text := want;
  is_minor boolean := lower(coalesce(new.raw_user_meta_data->>'minor', '')) in ('true', 't', '1', 'yes', 'y', 'on');
begin
  if nick is null or char_length(nick) not between 2 and 10 or nick !~ '^[가-힣a-zA-Z0-9_]+$' then nick := null; end if;
  -- 가입 직전에 누가 닉네임을 가져갔다면 숫자를 붙인다 (마이페이지에서 바꿀 수 있음)
  if nick is not null and exists (select 1 from profiles where nickname = nick) then
    nick := left(nick, 7) || (100 + floor(random() * 900))::int;
  end if;
  while nick is null or exists (select 1 from profiles where nickname = nick) loop
    nick := '새싹' || (1000 + floor(random() * 9000))::int;
  end loop;
  insert into profiles (id, nickname) values (new.id, nick);
  insert into accounts (user_id, is_guest, minor, guardian_email)
  values (new.id, coalesce(new.is_anonymous, false), is_minor,
          nullif(trim(coalesce(new.raw_user_meta_data->>'guardian_email', '')), ''));
  perform _grant_starter(new.id);
  return new;
end $$;

-- 탈퇴한 이웃은 소개·친구·집을 보여주지 않는다
create or replace function public._public_profile(target uuid, viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'nickname', _nick(p.id),
    'bio', case when p.status = 'withdrawn' then null when p.id = viewer or p.bio_public then p.bio else null end,
    'home', case when p.status = 'withdrawn' then null else (select _home_json(h.id) from homes h where h.occupant = p.id) end,
    'npc', p.is_npc,
    'msgFrom', p.msg_from,
    'friends', case when p.status <> 'withdrawn' and (p.id = viewer or p.friends_public) then
        (select coalesce(jsonb_agg(_nick(case when f.from_id = p.id then f.to_id else f.from_id end)), '[]'::jsonb)
         from friendships f where f.status = 'accepted' and (f.from_id = p.id or f.to_id = p.id))
      else null end,
    'relation', case when viewer is not null and viewer <> p.id then _relation(viewer, p.id) else null end)
  from profiles p where p.id = target;
$$;

create or replace function public.update_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); n text;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'INVALID|잘못된 요청이에요.'; end if;
  if p ? 'nickname' then
    n := trim(coalesce(p->>'nickname', ''));
    if char_length(n) not between 2 and 10 then raise exception 'INVALID|닉네임은 2~10자로 지어주세요.'; end if;
    if n !~ '^[가-힣a-zA-Z0-9_]+$' then raise exception 'INVALID|한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요.'; end if;
    if exists (select 1 from profiles where nickname = n and id <> u) then raise exception 'NICK_TAKEN|이미 다른 이웃이 쓰고 있는 닉네임이에요.'; end if;
    update profiles set nickname = n where id = u;
  end if;
  if p ? 'bio' then
    if jsonb_typeof(p->'bio') <> 'string' then raise exception 'INVALID|소개 형식이 올바르지 않아요.'; end if;
    if char_length(p->>'bio') > 80 then raise exception 'INVALID|소개는 80자까지 쓸 수 있어요.'; end if;
    update profiles set bio = p->>'bio' where id = u;
  end if;
  if p ? 'bioPublic' then
    if jsonb_typeof(p->'bioPublic') <> 'boolean' then raise exception 'INVALID|잘못된 설정이에요.'; end if;
    update profiles set bio_public = (p->>'bioPublic')::boolean where id = u;
  end if;
  if p ? 'friendsPublic' then
    if jsonb_typeof(p->'friendsPublic') <> 'boolean' then raise exception 'INVALID|잘못된 설정이에요.'; end if;
    update profiles set friends_public = (p->>'friendsPublic')::boolean where id = u;
  end if;
  if p ? 'msgFrom' then
    if coalesce(p->>'msgFrom', '') not in ('all','friends','none') then raise exception 'INVALID|잘못된 설정이에요.'; end if;
    update profiles set msg_from = p->>'msgFrom' where id = u;
  end if;
  return my_account();
end $$;

-- 좌표·회전·겹침 순서의 형식을 검사하고, 회전은 0~359, 겹침 순서는 0~999로 맞춘다
create or replace function public.save_room(p_wallpaper text, p_floor text, p_placed jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); n int; nd int;
begin
  if jsonb_typeof(p_placed) is distinct from 'array' then raise exception 'INVALID|배치 정보가 올바르지 않아요.'; end if;
  if exists (select 1 from jsonb_array_elements(p_placed) e
             where jsonb_typeof(e) <> 'object'
                or jsonb_typeof(e->'instId') is distinct from 'string'
                or jsonb_typeof(e->'x') is distinct from 'number' or jsonb_typeof(e->'y') is distinct from 'number'
                or coalesce(jsonb_typeof(e->'rot'), 'number') not in ('number', 'null')
                or coalesce(jsonb_typeof(e->'z'), 'number') not in ('number', 'null')
                or coalesce(jsonb_typeof(e->'flip'), 'boolean') not in ('boolean', 'null')) then
    raise exception 'INVALID|배치 정보가 올바르지 않아요.';
  end if;
  select count(*), count(distinct e->>'instId') into n, nd from jsonb_array_elements(p_placed) e;
  if n <> nd then raise exception 'DUPLICATE|같은 가구를 두 곳에 놓을 수 없어요.'; end if;
  if n > 200 then raise exception 'INVALID|가구가 너무 많아요.'; end if;
  if exists (select 1 from jsonb_array_elements(p_placed) e
             where not exists (select 1 from user_items ui join items i on i.id = ui.item_id
                               where ui.id::text = e->>'instId' and ui.user_id = u and i.type = 'furniture')) then
    raise exception 'NOT_OWNED|가지고 있지 않은 가구가 포함되어 있어요.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_placed) e
             where (e->>'x')::numeric not between -1 and 101 or (e->>'y')::numeric not between -1 and 101) then
    raise exception 'OUT_OF_BOUNDS|방 밖으로 나간 가구가 있어요.';
  end if;
  if not exists (select 1 from user_items ui join items i on i.id = ui.item_id where ui.user_id = u and ui.item_id = p_wallpaper and i.type = 'wallpaper')
     or not exists (select 1 from user_items ui join items i on i.id = ui.item_id where ui.user_id = u and ui.item_id = p_floor and i.type = 'floor') then
    raise exception 'NOT_OWNED|가지고 있지 않은 벽지나 바닥이에요.';
  end if;
  insert into room_layouts (user_id, wallpaper, floor, placed, saved_at)
  values (u, p_wallpaper, p_floor, (
    select coalesce(jsonb_agg(jsonb_build_object(
      'instId', ui.id, 'itemId', ui.item_id,
      'x', round((e->>'x')::numeric, 2), 'y', round((e->>'y')::numeric, 2),
      'rot', ((round(coalesce((e->>'rot')::numeric, 0))::int % 360) + 360) % 360,
      'flip', coalesce((e->>'flip')::boolean, false),
      'z', z) order by z), '[]'::jsonb)
    from jsonb_array_elements(p_placed) e
    join user_items ui on ui.id::text = e->>'instId'
    cross join lateral (select least(999, greatest(0, round(coalesce((e->>'z')::numeric, 1))::int)) as z) zz), now())
  on conflict (user_id) do update set wallpaper = excluded.wallpaper, floor = excluded.floor, placed = excluded.placed, saved_at = excluded.saved_at;
  return jsonb_build_object('savedAt', now());
end $$;

-- 탈퇴·정지된 이웃의 방에는 좋아요를 새로 누를 수 없다 (취소는 가능)
create or replace function public.toggle_like(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  if p_owner = u then raise exception 'INVALID|내 방에는 좋아요를 누를 수 없어요.'; end if;
  delete from room_likes where user_id = u and owner_id = p_owner;
  if not found then
    if not exists (select 1 from room_layouts l join profiles p on p.id = l.user_id where l.user_id = p_owner and p.status = 'active') then
      raise exception 'NOT_FOUND|방을 찾을 수 없어요.';
    end if;
    if _blocked(u, p_owner) then raise exception 'BLOCKED|지금은 이 방에 좋아요를 누를 수 없어요.'; end if;
    insert into room_likes (user_id, owner_id) values (u, p_owner);
  end if;
  return _likes(p_owner, u);
end $$;

-- 신고: 쪽지를 첨부할 때는 내가 받은 쪽지만, 신고 대상은 그 쪽지를 보낸 이웃으로 고정한다
create or replace function public.report_user(p_target uuid, p_message uuid, p_reason text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); snap text; tgt uuid := p_target; r text := trim(coalesce(p_reason, ''));
begin
  if r = '' then raise exception 'INVALID|신고 사유를 골라주세요.'; end if;
  if p_message is not null then
    select body, from_id into snap, tgt from messages where id = p_message and to_id = u;
    if not found then raise exception 'NOT_FOUND|받은 쪽지만 신고할 수 있어요.'; end if;
    if p_target is not null and p_target <> tgt then raise exception 'INVALID|쪽지를 보낸 이웃만 신고할 수 있어요.'; end if;
    if exists (select 1 from reports where reporter = u and message_id = p_message) then
      raise exception 'DUPLICATE|이미 신고한 쪽지예요. 운영팀이 확인 중이에요.';
    end if;
  end if;
  if tgt is null or tgt = u or not exists (select 1 from profiles where id = tgt) then
    raise exception 'NOT_FOUND|신고할 이웃을 찾지 못했어요.';
  end if;
  if (select count(*) from reports where reporter = u and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMIT|신고를 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요.';
  end if;
  insert into reports (reporter, target_id, message_id, snapshot, reason, detail)
  values (u, tgt, p_message, snap, left(r, 40), left(coalesce(p_detail, ''), 200));
end $$;

create or replace function public.buy_item(p_item text, p_idem_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); it items; prev purchases; bal jsonb; use_free int; use_paid int; inst uuid; pid uuid;
begin
  if coalesce(char_length(p_idem_key), 0) not between 1 and 100 then raise exception 'INVALID|잘못된 구매 요청이에요.'; end if;
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
  -- 어느 한쪽 잔액이 음수인 이상 상태라도 없는 몽글로 결제되지 않게 한다
  use_free := least(greatest((bal->>'free')::int, 0), it.price);
  use_paid := it.price - use_free;
  if use_paid > greatest((bal->>'paid')::int, 0) then raise exception 'INSUFFICIENT|몽글이 부족해요.'; end if;
  insert into user_items (user_id, item_id, source) values (u, p_item, 'purchase') returning id into inst;
  insert into purchases (user_id, item_id, price, inst_id, idem_key) values (u, p_item, it.price, inst, p_idem_key) returning id into pid;
  insert into wallet_transactions (user_id, type, paid, free, ref, reason) values (u, 'purchase', -use_paid, -use_free, pid::text, it.name || ' 구매');
  return jsonb_build_object('purchaseId', pid, 'instId', inst, 'balance', _balance(u), 'replayed', false);
end $$;

-- 체험 계정은 로그아웃하면 다시 들어올 수 없어 충전을 막는다. 결제 대기 주문을 너무 많이 만들지 못하게 한다.
create or replace function public.create_order(p_product text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); p charge_products; a accounts; oid text;
begin
  select * into p from charge_products where id = p_product and sale;
  if not found then raise exception 'NOT_FOUND|판매 중인 충전 상품이 아니에요.'; end if;
  select * into a from accounts where user_id = u;
  if not found or a.is_guest then raise exception 'GUEST|체험 계정은 충전할 수 없어요. 회원가입 후 이용해 주세요.'; end if;
  if a.minor and not a.guardian_consent then raise exception 'GUARDIAN_REQUIRED|보호자 동의가 확인된 뒤에 충전할 수 있어요.'; end if;
  if (select count(*) from payment_orders where user_id = u and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'RATE_LIMIT|결제 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  end if;
  oid := 'MONGLE-' || to_char(now() at time zone 'Asia/Seoul', 'YYMMDDHH24MISS') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into payment_orders (order_id, user_id, product_id, product_name, amount, coins) values (oid, u, p.id, p.name, p.price, p.coins);
  insert into payment_audit (order_id, event, detail) values (oid, 'ORDER_CREATED', p.name || ' ' || p.price || '원');
  return jsonb_build_object('orderId', oid, 'amount', p.price, 'orderName', p.name, 'coins', p.coins);
end $$;

-- 환불: 회수를 먼저 DB에 확정(잔액 잠금 + 확인)한 뒤 토스 취소를 부른다.
-- 토스 취소가 실패하면 _refund_revert로 되돌린다. 원장은 지우지 않고 반대 기록을 남긴다.
drop function if exists public._refund_check(text);
drop function if exists public._refund_apply(text, text, uuid);

create function public._refund_apply(p_order text, p_reason text, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o payment_orders; bal jsonb;
begin
  select * into o from payment_orders where order_id = p_order for update;
  if not found or o.status <> 'DONE' or not o.granted then raise exception 'INVALID_STATE|승인 완료된 주문만 환불할 수 있어요.'; end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || o.user_id::text));
  bal := _balance(o.user_id);
  if (bal->>'paid')::int < o.coins then
    raise exception 'COINS_USED|이미 사용한 유료 몽글이 있어 자동 환불할 수 없어요. (보유 유료 % / 회수 필요 %)', bal->>'paid', o.coins;
  end if;
  update payment_orders set status = 'REFUNDED', refunded_at = now(), refund_reason = p_reason where order_id = p_order returning * into o;
  insert into wallet_transactions (user_id, type, paid, order_id, reason, actor) values (o.user_id, 'refund', -o.coins, p_order, '환불 회수: ' || p_reason, p_actor);
  insert into payment_audit (order_id, event, detail) values (p_order, 'REFUND_RESERVED', p_reason);
  return to_jsonb(o);
end $$;

create function public._refund_done(p_order text, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into payment_audit (order_id, event, detail) values (p_order, 'REFUNDED', p_reason);
  insert into admin_log (actor, action, target, detail) values (p_actor, 'REFUND', p_order, p_reason);
end $$;

create function public._refund_revert(p_order text, p_detail text, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o payment_orders;
begin
  update payment_orders set status = 'DONE', refunded_at = null, refund_reason = null
  where order_id = p_order and status = 'REFUNDED' returning * into o;
  if not found then return; end if;
  insert into wallet_transactions (user_id, type, paid, order_id, reason, actor) values (o.user_id, 'refund', o.coins, p_order, '환불 실패로 회수 취소', p_actor);
  insert into payment_audit (order_id, event, detail) values (p_order, 'REFUND_FAILED', left(p_detail, 500));
end $$;

-- 관리자 조정: 구매와 같은 잔액 잠금을 걸어 동시 처리로 음수가 되지 않게 한다
create or replace function public.admin_adjust(p_user uuid, p_amount int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  if coalesce(p_amount, 0) = 0 then raise exception 'INVALID|조정할 수량을 입력해 주세요.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'INVALID|조정 사유는 꼭 남겨야 해요.'; end if;
  if not exists (select 1 from profiles where id = p_user and not is_npc) then raise exception 'NOT_FOUND|이웃을 찾지 못했어요.'; end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || p_user::text));
  if p_amount < 0 and (_balance(p_user)->>'free')::int + p_amount < 0 then raise exception 'INVALID|회수량이 무료 재화 잔액보다 많아요.'; end if;
  insert into wallet_transactions (user_id, type, free, reason, actor) values (p_user, 'admin', p_amount, trim(p_reason), me);
  insert into admin_log (actor, action, target, detail) values (me, 'WALLET_ADJUST', p_user::text, p_amount || ' ' || p_reason);
end $$;

create or replace function public.admin_update_item(p_id text, p_price int, p_sale boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  if p_price is null or p_sale is null then raise exception 'INVALID|가격과 판매 여부를 모두 정해주세요.'; end if;
  update items set price = greatest(0, p_price), sale = p_sale where id = p_id;
  if not found then raise exception 'NOT_FOUND|없는 아이템이에요.'; end if;
  insert into admin_log (actor, action, target, detail) values (me, 'ITEM_UPDATE', p_id, p_price || '/' || p_sale);
end $$;

create or replace function public.admin_update_product(p_id text, p_price int, p_coins int, p_sale boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  if p_price is null or p_coins is null or p_sale is null then raise exception 'INVALID|가격·몽글·판매 여부를 모두 정해주세요.'; end if;
  update charge_products set price = greatest(100, p_price), coins = greatest(1, p_coins), sale = p_sale where id = p_id;
  if not found then raise exception 'NOT_FOUND|없는 상품이에요.'; end if;
  insert into admin_log (actor, action, target, detail) values (me, 'PRODUCT_UPDATE', p_id, p_price || '/' || p_coins || '/' || p_sale);
end $$;

create or replace function public.admin_set_home_available(p_id text, p_available boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  if p_available is null then raise exception 'INVALID|잘못된 설정이에요.'; end if;
  update homes set available = p_available where id = p_id and occupant is null;
  if not found then raise exception 'INVALID_STATE|없는 집이거나 이웃이 살고 있는 집이에요.'; end if;
  insert into admin_log (actor, action, target, detail) values (me, 'HOME_AVAILABLE', p_id, p_available::text);
end $$;

create or replace function public.admin_resolve_report(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _require_admin();
begin
  if coalesce(p_status, '') not in ('resolved', 'dismissed') then raise exception 'INVALID|잘못된 상태예요.'; end if;
  update reports set status = p_status, note = p_note, resolved_at = now(), resolved_by = me where id = p_id;
  if not found then raise exception 'NOT_FOUND|없는 신고예요.'; end if;
  insert into admin_log (actor, action, target, detail) values (me, 'REPORT_' || upper(p_status), p_id::text, p_note);
end $$;

/* 실행 권한: 새로 만든 함수 포함 다시 정리 */
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
