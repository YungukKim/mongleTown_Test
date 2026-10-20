-- 몽글마을 스키마. 클라이언트는 테이블에 직접 쓰지 않고 security definer RPC만 호출한다.

create table public.profiles (
  id uuid primary key,
  nickname text not null unique check (char_length(nickname) between 2 and 10),
  bio text not null default '' check (char_length(bio) <= 80),
  bio_public boolean not null default true,
  friends_public boolean not null default false,
  msg_from text not null default 'all' check (msg_from in ('all','friends','none')),
  is_npc boolean not null default false,
  status text not null default 'active' check (status in ('active','suspended','withdrawn')),
  created_at timestamptz not null default now()
);

create table public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','admin')),
  is_guest boolean not null default false,
  minor boolean not null default false,
  guardian_email text,
  guardian_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.homes (
  id text primary key,
  kind text not null check (kind in ('house','apt')),
  no int not null,
  name text not null,
  address text not null,
  occupant uuid unique references public.profiles(id),
  available boolean not null default true
);

create table public.residences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  home_id text not null references public.homes(id),
  moved_in_at timestamptz not null default now(),
  moved_out_at timestamptz
);
create index on public.residences (user_id) where moved_out_at is null;

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id),
  to_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_id <> to_id)
);
create unique index friendships_active_pair on public.friendships (least(from_id, to_id), greatest(from_id, to_id)) where status in ('pending','accepted');
create index on public.friendships (to_id);
create index on public.friendships (from_id);

create table public.blocks (
  by_id uuid not null references public.profiles(id),
  target_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (by_id, target_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id),
  to_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  del_by_sender boolean not null default false,
  del_by_recipient boolean not null default false
);
create index on public.messages (to_id, created_at desc);
create index on public.messages (from_id, created_at desc);

create table public.items (
  id text primary key,
  name text not null,
  cat text not null,
  type text not null check (type in ('furniture','wallpaper','floor')),
  price int not null check (price >= 0),
  stack boolean not null default true,
  sale boolean not null default true,
  starter boolean not null default false
);

create table public.user_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  item_id text not null references public.items(id),
  source text not null,
  acquired_at timestamptz not null default now()
);
create index on public.user_items (user_id);

create table public.room_layouts (
  user_id uuid primary key references public.profiles(id),
  wallpaper text not null references public.items(id),
  floor text not null references public.items(id),
  placed jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now()
);

create table public.room_likes (
  user_id uuid not null references public.profiles(id),
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (user_id, owner_id),
  check (user_id <> owner_id)
);
create index on public.room_likes (owner_id);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type text not null check (type in ('charge','purchase','event','refund','admin')),
  paid int not null default 0,
  free int not null default 0,
  order_id text,
  ref text,
  reason text,
  actor uuid,
  created_at timestamptz not null default now()
);
create index on public.wallet_transactions (user_id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  item_id text not null references public.items(id),
  price int not null,
  inst_id uuid not null references public.user_items(id),
  idem_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idem_key)
);

create table public.charge_products (
  id text primary key,
  name text not null,
  price int not null check (price >= 100),
  coins int not null check (coins > 0),
  sale boolean not null default true,
  sort int not null default 0
);

create table public.payment_orders (
  order_id text primary key,
  user_id uuid not null references public.profiles(id),
  product_id text not null references public.charge_products(id),
  product_name text not null,
  amount int not null,
  coins int not null,
  status text not null default 'READY' check (status in ('READY','DONE','FAILED','CANCELED','REFUNDED')),
  payment_key text,
  method text,
  receipt_url text,
  granted boolean not null default false,
  fail_reason text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  refunded_at timestamptz,
  refund_reason text
);
create index on public.payment_orders (user_id);

create table public.payment_audit (
  id bigint generated always as identity primary key,
  order_id text not null,
  event text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references public.profiles(id),
  target_id uuid not null references public.profiles(id),
  message_id uuid references public.messages(id),
  snapshot text,
  reason text not null,
  detail text not null default '',
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

create table public.admin_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);

-- 모든 테이블 RLS 켜기. 정책이 없으면 직접 접근은 거부되고, RPC(security definer)로만 다룬다.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 공개 카탈로그는 읽기 허용
grant select on public.items, public.charge_products to anon, authenticated;
create policy "items readable" on public.items for select to anon, authenticated using (true);
create policy "products readable" on public.charge_products for select to anon, authenticated using (sale);
