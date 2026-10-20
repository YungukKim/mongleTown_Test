insert into public.items (id, name, cat, type, price, stack, starter) values
 ('bed_basic','포근한 침대','furniture','furniture',120,true,true),
 ('chair_wood','나무 의자','furniture','furniture',40,true,true),
 ('desk_small','작은 책상','furniture','furniture',80,true,true),
 ('sofa','몽글 소파','furniture','furniture',180,true,false),
 ('bookshelf','키다리 책장','furniture','furniture',150,true,false),
 ('table_round','동그란 탁자','furniture','furniture',70,true,false),
 ('lamp_stand','스탠드 조명','lighting','furniture',60,true,true),
 ('lamp_ceiling','천장등','lighting','furniture',90,true,false),
 ('plant_small','작은 화분','deco','furniture',30,true,true),
 ('frame','그림 액자','deco','furniture',50,true,false),
 ('teddy','곰 인형','deco','furniture',70,true,false),
 ('rug','동그라미 러그','deco','furniture',60,true,false),
 ('window_curtain','커튼 창문','interior','furniture',100,true,false),
 ('books','책 더미','life','furniture',25,true,false),
 ('cup','머그컵','life','furniture',15,true,true),
 ('clock','벽시계','life','furniture',45,true,false),
 ('snowman','눈사람','season','furniture',80,true,false),
 ('tulip','튤립 화분','season','furniture',55,true,false),
 ('wall_plain','하얀 벽지','interior','wallpaper',0,false,true),
 ('wall_stripe','줄무늬 벽지','interior','wallpaper',80,false,false),
 ('wall_dots','물방울 벽지','interior','wallpaper',80,false,false),
 ('wall_check','체크 벽지','interior','wallpaper',100,false,false),
 ('floor_wood','나무 마루','interior','floor',0,false,true),
 ('floor_tile','타일 바닥','interior','floor',80,false,false),
 ('floor_herring','헤링본 바닥','interior','floor',120,false,false);

insert into public.charge_products (id, name, price, coins, sort) values
 ('p_1000','몽글 한 줌',1000,100,1),
 ('p_5000','몽글 한 봉지',5000,550,2),
 ('p_10000','몽글 한 바구니',10000,1150,3),
 ('p_30000','몽글 한 상자',30000,3600,4);

insert into public.homes (id, kind, no, name, address)
select 'h' || n, 'house', n, nm, '몽글마을 ' || n || '번지'
from unnest(array['해바라기집','구름빵집','도토리집','민들레집','조약돌집','솔방울집','달맞이집','보리밭집']) with ordinality as t(nm, n);

insert into public.homes (id, kind, no, name, address)
select 'a' || (f * 100 + c), 'apt', f * 100 + c, '몽글아파트 ' || (f * 100 + c) || '호', '몽글마을 9번지 몽글아파트 ' || (f * 100 + c) || '호'
from generate_series(1, 5) f, generate_series(1, 2) c;

-- 데모 이웃(NPC)
do $$
declare n record; e jsonb; inst uuid; placed jsonb; z int;
begin
  for n in select * from (values
    ('00000000-0000-4000-8000-000000000001'::uuid,'구름이','하늘 보는 걸 좋아해요. 쪽지 환영!',true,'all','h2','wall_dots','floor_wood','[["sofa",30,52],["window_curtain",38,10],["rug",30,82],["plant_small",70,50],["teddy",46,48]]'::jsonb),
    ('00000000-0000-4000-8000-000000000002'::uuid,'솜사탕','달콤한 하루 보내세요 :)',true,'all','h5','wall_stripe','floor_tile','[["bed_basic",8,50],["lamp_stand",44,36],["frame",60,14],["tulip",80,56]]'::jsonb),
    ('00000000-0000-4000-8000-000000000003'::uuid,'달팽이','천천히, 하지만 꾸준히.',false,'all','a201','wall_check','floor_herring','[["bookshelf",10,30],["desk_small",40,52],["chair_wood",62,52],["clock",45,12],["books",44,44]]'::jsonb),
    ('00000000-0000-4000-8000-000000000004'::uuid,'보리차','친구에게만 쪽지를 받아요.',true,'friends','a302','wall_plain','floor_wood','[["table_round",40,60],["cup",47,55],["lamp_ceiling",44,0],["plant_small",12,52]]'::jsonb),
    ('00000000-0000-4000-8000-000000000005'::uuid,'노을','저녁 산책 메이트 구해요.',true,'all','h7','wall_stripe','floor_herring','[["window_curtain",10,10],["sofa",40,52],["snowman",84,52]]'::jsonb),
    ('00000000-0000-4000-8000-000000000006'::uuid,'토끼풀','네잎클로버 찾는 중',true,'none','a501','wall_dots','floor_tile','[["bed_basic",52,50],["teddy",20,55],["tulip",8,56]]'::jsonb)
  ) as t(id, nick, bio, bio_public, msg_from, home, wall, floor, items)
  loop
    insert into public.profiles (id, nickname, bio, bio_public, msg_from, is_npc) values (n.id, n.nick, n.bio, n.bio_public, n.msg_from, true);
    update public.homes set occupant = n.id where id = n.home;
    insert into public.residences (user_id, home_id) values (n.id, n.home);
    placed := '[]'::jsonb; z := 0;
    for e in select value from jsonb_array_elements(n.items) loop
      z := z + 1;
      insert into public.user_items (user_id, item_id, source) values (n.id, e->>0, 'seed') returning id into inst;
      placed := placed || jsonb_build_array(jsonb_build_object('instId', inst, 'itemId', e->>0, 'x', (e->>1)::numeric, 'y', (e->>2)::numeric, 'rot', 0, 'flip', false, 'z', z));
    end loop;
    insert into public.user_items (user_id, item_id, source) values (n.id, n.wall, 'seed'), (n.id, n.floor, 'seed');
    insert into public.room_layouts (user_id, wallpaper, floor, placed) values (n.id, n.wall, n.floor, placed);
  end loop;
end $$;

insert into public.room_likes (user_id, owner_id)
select a.id, b.id from public.profiles a, public.profiles b
where a.is_npc and b.is_npc and a.id <> b.id and abs(hashtext(a.id::text || b.id::text)) % 3 <> 0;
