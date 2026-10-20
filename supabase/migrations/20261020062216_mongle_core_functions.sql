-- 오류는 'CODE|사용자에게 보여줄 문장' 형식으로 올린다. 클라이언트가 나눠서 쓴다.

create or replace function public._uid() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare u uuid := auth.uid(); s text;
begin
  if u is null then raise exception 'UNAUTHORIZED|로그인이 필요해요.'; end if;
  select status into s from profiles where id = u;
  if s is null then raise exception 'UNAUTHORIZED|계정 정보를 찾지 못했어요.'; end if;
  if s = 'withdrawn' then raise exception 'WITHDRAWN|탈퇴한 계정이에요.'; end if;
  if s = 'suspended' then raise exception 'SUSPENDED|운영 정책에 따라 이용이 제한된 계정이에요. 고객센터로 문의해 주세요.'; end if;
  return u;
end $$;

create or replace function public._is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from accounts where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public._require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  if not _is_admin() then raise exception 'FORBIDDEN|관리자만 볼 수 있어요.'; end if;
  return u;
end $$;

create or replace function public._nick(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when status = 'withdrawn' then '떠난 이웃' else nickname end from profiles where id = p;
$$;

create or replace function public._blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (by_id = a and target_id = b) or (by_id = b and target_id = a));
$$;

create or replace function public._friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where status = 'accepted' and ((from_id = a and to_id = b) or (from_id = b and to_id = a)));
$$;

create or replace function public._relation(a uuid, b uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from blocks where by_id = a and target_id = b) then 'blocked'
    when _friend(a, b) then 'friend'
    when exists (select 1 from friendships where status = 'pending' and from_id = a and to_id = b) then 'sent'
    when exists (select 1 from friendships where status = 'pending' and from_id = b and to_id = a) then 'received'
    else 'none' end;
$$;

create or replace function public._balance(p uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('paid', coalesce(sum(paid), 0), 'free', coalesce(sum(free), 0), 'total', coalesce(sum(paid + free), 0))
  from wallet_transactions where user_id = p;
$$;

create or replace function public._home_json(h text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'kind', kind, 'no', no, 'name', name, 'address', address) from homes where id = h;
$$;

create or replace function public._likes(owner uuid, viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'count', count(*),
    'liked', coalesce(bool_or(user_id = viewer), false),
    'likers', coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'nickname', _nick(user_id), 'at', created_at) order by created_at desc), '[]'::jsonb))
  from room_likes where owner_id = owner;
$$;

create or replace function public._public_profile(target uuid, viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'nickname', _nick(p.id),
    'bio', case when p.id = viewer or p.bio_public then p.bio else null end,
    'home', (select _home_json(h.id) from homes h where h.occupant = p.id),
    'npc', p.is_npc,
    'msgFrom', p.msg_from,
    'friends', case when p.id = viewer or p.friends_public then
        (select coalesce(jsonb_agg(_nick(case when f.from_id = p.id then f.to_id else f.from_id end)), '[]'::jsonb)
         from friendships f where f.status = 'accepted' and (f.from_id = p.id or f.to_id = p.id))
      else null end,
    'relation', case when viewer is not null and viewer <> p.id then _relation(viewer, p.id) else null end)
  from profiles p where p.id = target;
$$;

-- 첫 입주 선물: 기본 가구 + 300 무료 몽글 + 빈 방 + 이웃의 환영 인사(데모)
create or replace function public._grant_starter(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into user_items (user_id, item_id, source) select p, id, 'starter' from items where starter;
  insert into wallet_transactions (user_id, type, free, reason) values (p, 'event', 300, '첫 입주 환영 선물');
  insert into room_layouts (user_id, wallpaper, floor) values (p, 'wall_plain', 'floor_wood');
  insert into messages (from_id, to_id, body) values ('00000000-0000-4000-8000-000000000002', p,
    E'몽글마을에 온 걸 환영해요, 이웃님!\n천천히 둘러보고 마음에 드는 집을 골라보세요. 궁금한 게 있으면 언제든 쪽지 주세요 :)');
  insert into friendships (from_id, to_id) values ('00000000-0000-4000-8000-000000000001', p);
  insert into room_likes (user_id, owner_id) values ('00000000-0000-4000-8000-000000000002', p);
end $$;

create or replace function public._handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  want text := nullif(trim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');
  nick text := want;
begin
  if nick is null or char_length(nick) not between 2 and 10 then nick := null; end if;
  -- 가입 직전에 누가 닉네임을 가져갔다면 숫자를 붙인다 (마이페이지에서 바꿀 수 있음)
  if nick is not null and exists (select 1 from profiles where nickname = nick) then
    nick := left(nick, 7) || (100 + floor(random() * 900))::int;
  end if;
  while nick is null or exists (select 1 from profiles where nickname = nick) loop
    nick := '새싹' || (1000 + floor(random() * 9000))::int;
  end loop;
  insert into profiles (id, nickname) values (new.id, nick);
  insert into accounts (user_id, is_guest, minor, guardian_email)
  values (new.id, coalesce(new.is_anonymous, false),
          coalesce((new.raw_user_meta_data->>'minor')::boolean, false),
          nullif(new.raw_user_meta_data->>'guardian_email', ''));
  perform _grant_starter(new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public._handle_new_user();

/* ================= 계정 / 프로필 ================= */

create or replace function public.nickname_available(p_nickname text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where nickname = trim(p_nickname));
$$;

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
    'unread', (select count(*) from messages m where m.to_id = u and m.read_at is null and not m.del_by_recipient
                 and not exists (select 1 from blocks b where b.by_id = u and b.target_id = m.from_id)),
    'pendingFriends', (select count(*) from friendships f where f.to_id = u and f.status = 'pending'))
  into r
  from profiles p left join accounts a on a.user_id = p.id where p.id = u;
  return r;
end $$;

create or replace function public.get_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return _public_profile(p_user, u);
end $$;

create or replace function public.update_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); n text;
begin
  if p ? 'nickname' then
    n := trim(p->>'nickname');
    if char_length(n) not between 2 and 10 then raise exception 'INVALID|닉네임은 2~10자로 지어주세요.'; end if;
    if n !~ '^[가-힣a-zA-Z0-9_]+$' then raise exception 'INVALID|한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요.'; end if;
    if exists (select 1 from profiles where nickname = n and id <> u) then raise exception 'NICK_TAKEN|이미 다른 이웃이 쓰고 있는 닉네임이에요.'; end if;
    update profiles set nickname = n where id = u;
  end if;
  if p ? 'bio' then
    if char_length(p->>'bio') > 80 then raise exception 'INVALID|소개는 80자까지 쓸 수 있어요.'; end if;
    update profiles set bio = p->>'bio' where id = u;
  end if;
  if p ? 'bioPublic' then update profiles set bio_public = (p->>'bioPublic')::boolean where id = u; end if;
  if p ? 'friendsPublic' then update profiles set friends_public = (p->>'friendsPublic')::boolean where id = u; end if;
  if p ? 'msgFrom' then
    if p->>'msgFrom' not in ('all','friends','none') then raise exception 'INVALID|잘못된 설정이에요.'; end if;
    update profiles set msg_from = p->>'msgFrom' where id = u;
  end if;
  return my_account();
end $$;

-- 탈퇴: 집을 비우고 관계를 정리한 뒤 계정을 탈퇴 상태로 바꾼다. 결제·원장 기록은 남긴다.
create or replace function public.withdraw() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  update homes set occupant = null where occupant = u;
  update residences set moved_out_at = now() where user_id = u and moved_out_at is null;
  delete from friendships where from_id = u or to_id = u;
  delete from room_likes where user_id = u or owner_id = u;
  update profiles set status = 'withdrawn' where id = u;
end $$;

/* ================= 마을 / 주거 ================= */

create or replace function public.get_village() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return (select jsonb_agg(jsonb_build_object(
      'id', h.id, 'available', h.available, 'occupantId', h.occupant,
      'occupantName', case when h.occupant is null then null else _nick(h.occupant) end,
      'mine', h.occupant = u,
      'likes', case when h.occupant is null then 0 else (select count(*) from room_likes l where l.owner_id = h.occupant) end)
    order by h.id) from homes h);
end $$;

create or replace function public.get_home_detail(p_home text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid(); h homes;
begin
  select * into h from homes where id = p_home;
  if not found then raise exception 'NOT_FOUND|없는 집이에요.'; end if;
  return _home_json(h.id) || jsonb_build_object(
    'available', h.available, 'occupied', h.occupant is not null, 'mine', h.occupant = u,
    'resident', case when h.occupant is null then null
                     else _public_profile(h.occupant, u) || jsonb_build_object('likes', (_likes(h.occupant, u))->'count') end);
end $$;

-- 입주와 이사: 빈집 확인 → 이전 집 비우기 → 새 집 점유를 한 트랜잭션에서 처리 (행 잠금으로 동시 입주 방지)
create or replace function public.move_to(p_home text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); t homes; prev_id text;
begin
  select * into t from homes where id = p_home for update;
  if not found then raise exception 'NOT_FOUND|없는 집이에요.'; end if;
  if t.occupant = u then raise exception 'SAME_HOME|이미 살고 있는 집이에요.'; end if;
  if t.occupant is not null then raise exception 'ALREADY_OCCUPIED|아쉽게도 방금 다른 이웃이 먼저 입주했어요. 다른 빈집을 골라주세요.'; end if;
  if not t.available then raise exception 'UNAVAILABLE|지금은 입주할 수 없는 집이에요.'; end if;
  select id into prev_id from homes where occupant = u for update;
  if prev_id is not null then
    update homes set occupant = null where id = prev_id;
    update residences set moved_out_at = now() where user_id = u and moved_out_at is null;
  end if;
  update homes set occupant = u where id = p_home;
  insert into residences (user_id, home_id) values (u, p_home);
  return jsonb_build_object('home', _home_json(p_home), 'moved', prev_id is not null, 'from', case when prev_id is null then null else _home_json(prev_id) end);
end $$;

/* ================= 방 ================= */

create or replace function public.get_room(p_owner uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid(); o uuid := coalesce(p_owner, u); l room_layouts;
begin
  select * into l from room_layouts where user_id = o;
  if not found or (select status from profiles where id = o) = 'withdrawn' then
    raise exception 'NOT_FOUND|방 정보를 찾을 수 없어요.';
  end if;
  return jsonb_build_object('ownerId', o, 'readOnly', o <> u, 'wallpaper', l.wallpaper, 'floor', l.floor,
    'placed', l.placed, 'savedAt', l.saved_at, 'likes', _likes(o, u));
end $$;

create or replace function public.get_inventory() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'itemId', item_id, 'acquiredAt', acquired_at) order by acquired_at), '[]'::jsonb)
          from user_items where user_id = u);
end $$;

-- 서버 검증: 보유하지 않은 아이템, 같은 인스턴스 중복 배치, 범위 밖 좌표 거절. itemId는 서버 값으로 다시 채운다.
create or replace function public.save_room(p_wallpaper text, p_floor text, p_placed jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); n int; nd int;
begin
  if jsonb_typeof(p_placed) <> 'array' then raise exception 'INVALID|배치 정보가 올바르지 않아요.'; end if;
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
      'rot', mod(coalesce((e->>'rot')::int, 0), 360), 'flip', coalesce((e->>'flip')::boolean, false),
      'z', coalesce((e->>'z')::int, 1)) order by coalesce((e->>'z')::int, 1)), '[]'::jsonb)
    from jsonb_array_elements(p_placed) e join user_items ui on ui.id::text = e->>'instId'), now())
  on conflict (user_id) do update set wallpaper = excluded.wallpaper, floor = excluded.floor, placed = excluded.placed, saved_at = excluded.saved_at;
  return jsonb_build_object('savedAt', now());
end $$;

create or replace function public.room_likes(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return _likes(p_owner, u);
end $$;

create or replace function public.toggle_like(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  if p_owner = u then raise exception 'INVALID|내 방에는 좋아요를 누를 수 없어요.'; end if;
  if not exists (select 1 from room_layouts where user_id = p_owner) then raise exception 'NOT_FOUND|방을 찾을 수 없어요.'; end if;
  if _blocked(u, p_owner) then raise exception 'BLOCKED|지금은 이 방에 좋아요를 누를 수 없어요.'; end if;
  delete from room_likes where user_id = u and owner_id = p_owner;
  if not found then insert into room_likes (user_id, owner_id) values (u, p_owner); end if;
  return _likes(p_owner, u);
end $$;
