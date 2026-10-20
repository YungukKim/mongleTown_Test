create or replace function public.get_friends() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return jsonb_build_object(
    'friends', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'at', f.created_at, 'other', _public_profile(case when f.from_id = u then f.to_id else f.from_id end, u)) order by f.created_at desc), '[]'::jsonb)
                from friendships f where f.status = 'accepted' and (f.from_id = u or f.to_id = u)),
    'received', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'at', f.created_at, 'other', _public_profile(f.from_id, u)) order by f.created_at desc), '[]'::jsonb)
                 from friendships f where f.status = 'pending' and f.to_id = u),
    'sent', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'at', f.created_at, 'other', _public_profile(f.to_id, u)) order by f.created_at desc), '[]'::jsonb)
             from friendships f where f.status = 'pending' and f.from_id = u),
    'blocked', (select coalesce(jsonb_agg(jsonb_build_object('id', b.target_id, 'at', b.created_at, 'nickname', _nick(b.target_id)) order by b.created_at desc), '[]'::jsonb)
                from blocks b where b.by_id = u));
end $$;

create or replace function public.send_friend_request(p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); inc friendships; rej friendships; npc boolean;
begin
  if p_to = u then raise exception 'INVALID|나에게는 친구 요청을 보낼 수 없어요.'; end if;
  select is_npc into npc from profiles where id = p_to and status = 'active';
  if not found then raise exception 'NOT_FOUND|친구 요청을 받을 수 없는 이웃이에요.'; end if;
  if _blocked(u, p_to) then raise exception 'BLOCKED|지금은 이 이웃에게 친구 요청을 보낼 수 없어요.'; end if;
  if _friend(u, p_to) then raise exception 'ALREADY|이미 친구예요.'; end if;
  if exists (select 1 from friendships where status = 'pending' and from_id = u and to_id = p_to) then
    raise exception 'DUPLICATE|이미 요청을 보냈어요. 이웃의 답을 기다려 주세요.';
  end if;
  select * into inc from friendships where status = 'pending' and from_id = p_to and to_id = u;
  if found then
    update friendships set status = 'accepted', responded_at = now() where id = inc.id;
    return jsonb_build_object('status', 'accepted');
  end if;
  select * into rej from friendships where status = 'rejected' and from_id = u and to_id = p_to order by responded_at desc limit 1;
  if found and rej.responded_at > now() - interval '24 hours' then
    raise exception 'TOO_SOON|거절된 요청은 하루가 지난 뒤 다시 보낼 수 있어요.';
  end if;
  if (select count(*) from friendships where from_id = u and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMIT|친구 요청을 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요.';
  end if;
  delete from friendships where status = 'rejected' and from_id = u and to_id = p_to;
  -- 데모 이웃(NPC)은 바로 수락
  insert into friendships (from_id, to_id, status, responded_at)
  values (u, p_to, case when npc then 'accepted' else 'pending' end, case when npc then now() end);
  return jsonb_build_object('status', case when npc then 'accepted' else 'pending' end);
end $$;

create or replace function public.respond_friend(p_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  update friendships set status = case when p_accept then 'accepted' else 'rejected' end, responded_at = now()
  where id = p_id and to_id = u and status = 'pending';
  if not found then raise exception 'NOT_FOUND|이미 처리된 요청이에요.'; end if;
  return case when p_accept then 'accepted' else 'rejected' end;
end $$;

create or replace function public.cancel_friend_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  delete from friendships where id = p_id and from_id = u and status = 'pending';
end $$;

create or replace function public.remove_friend(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  delete from friendships where status = 'accepted' and ((from_id = u and to_id = p_other) or (from_id = p_other and to_id = u));
end $$;

create or replace function public.block_user(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  if p_target = u then raise exception 'INVALID|나를 차단할 수는 없어요.'; end if;
  insert into blocks (by_id, target_id) values (u, p_target) on conflict do nothing;
  delete from friendships where (from_id = u and to_id = p_target) or (from_id = p_target and to_id = u);
end $$;

create or replace function public.unblock_user(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  delete from blocks where by_id = u and target_id = p_target;
end $$;

create or replace function public.get_messages(p_box text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'from', m.from_id, 'to', m.to_id, 'body', m.body, 'at', m.created_at, 'readAt', m.read_at,
      'fromName', _nick(m.from_id), 'toName', _nick(m.to_id)) order by m.created_at desc), '[]'::jsonb)
    from messages m
    where case when p_box = 'sent' then m.from_id = u and not m.del_by_sender
               else m.to_id = u and not m.del_by_recipient
                    and not exists (select 1 from blocks b where b.by_id = u and b.target_id = m.from_id) end
      and m.created_at <= now());
end $$;

-- 수신자가 열었을 때만 읽음 처리
create or replace function public.mark_read(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  update messages set read_at = now() where id = p_id and to_id = u and read_at is null;
end $$;

create or replace function public.send_message(p_to uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); b text := trim(coalesce(p_body, '')); t profiles; m messages;
  replies text[] := array['쪽지 고마워요! 오늘 하루도 몽글몽글했나요?', '반가워요, 이웃님. 나중에 우리 집에도 놀러 와요 :)',
    '와, 쪽지 받으니까 기분이 좋아졌어요!', '요즘 날씨가 좋아서 산책하기 딱이에요. 이웃님은 어때요?', '방 구경 잘 했어요. 가구 배치 센스 최고!'];
begin
  if b = '' then raise exception 'EMPTY|안부를 한 글자 이상 적어주세요.'; end if;
  if char_length(b) > 500 then raise exception 'TOO_LONG|쪽지는 500자까지 쓸 수 있어요.'; end if;
  if p_to = u then raise exception 'INVALID|나에게는 쪽지를 보낼 수 없어요.'; end if;
  select * into t from profiles where id = p_to and status = 'active';
  if not found then raise exception 'NOT_FOUND|쪽지를 받을 수 없는 이웃이에요.'; end if;
  if _blocked(u, p_to) then raise exception 'BLOCKED|지금은 이 이웃에게 쪽지를 보낼 수 없어요.'; end if;
  if t.msg_from = 'none' then raise exception 'CLOSED|%님은 지금 쪽지를 받지 않고 있어요.', t.nickname; end if;
  if t.msg_from = 'friends' and not _friend(u, p_to) then
    raise exception 'FRIENDS_ONLY|%님은 친구에게서만 쪽지를 받아요. 먼저 친구 요청을 보내보세요.', t.nickname;
  end if;
  if (select count(*) from messages where from_id = u and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'RATE_LIMIT|쪽지를 너무 빨리 보내고 있어요. 1분 뒤에 다시 보내주세요.';
  end if;
  insert into messages (from_id, to_id, body) values (u, p_to, b) returning * into m;
  -- 데모 이웃(NPC)은 몇 초 뒤 도착하는 답장을 남긴다
  if t.is_npc then
    insert into messages (from_id, to_id, body, created_at)
    values (p_to, u, replies[1 + floor(random() * array_length(replies, 1))::int], now() + interval '4 seconds');
  end if;
  return jsonb_build_object('id', m.id, 'at', m.created_at);
end $$;

-- 기본 정책: 내 화면에서만 삭제
create or replace function public.delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  update messages set del_by_sender = true where id = p_id and from_id = u;
  update messages set del_by_recipient = true where id = p_id and to_id = u;
end $$;

create or replace function public.report_user(p_target uuid, p_message uuid, p_reason text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); snap text;
begin
  if p_message is not null then
    if exists (select 1 from reports where reporter = u and message_id = p_message) then
      raise exception 'DUPLICATE|이미 신고한 쪽지예요. 운영팀이 확인 중이에요.';
    end if;
    select body into snap from messages where id = p_message and (to_id = u or from_id = u);
  end if;
  insert into reports (reporter, target_id, message_id, snapshot, reason, detail)
  values (u, p_target, p_message, snap, left(p_reason, 40), left(coalesce(p_detail, ''), 200));
end $$;

create or replace function public.message_targets() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := _uid();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nickname', p.nickname, 'friend', _friend(u, p.id), 'msgFrom', p.msg_from)
            order by _friend(u, p.id) desc, p.nickname), '[]'::jsonb)
          from profiles p where p.id <> u and p.status = 'active' and not _blocked(u, p.id));
end $$;
