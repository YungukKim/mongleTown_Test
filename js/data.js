/* =========================================================
   정적 기획 데이터 (아이템 카탈로그, 집, 충전 상품, 이웃)
   백엔드 연동 시 items / homes / products 테이블로 옮겨질 값들
   ========================================================= */

const CATEGORIES = [
  { id: 'all', name: '전체' },
  { id: 'furniture', name: '가구' },
  { id: 'lighting', name: '조명' },
  { id: 'deco', name: '장식' },
  { id: 'life', name: '생활 소품' },
  { id: 'interior', name: '인테리어' },
  { id: 'season', name: '계절' },
];

/*
  type: furniture(방에 배치) | wallpaper | floor
  w: 방 너비 대비 가구 너비(%)
  stack: 중복 구매 허용 여부
  wallOnly: 벽에 거는 물건(배치 기본 위치가 벽)
*/
const ITEMS = [
  // 가구
  { id: 'bed_basic', name: '포근한 침대', cat: 'furniture', type: 'furniture', price: 120, w: 30, vb: '0 0 120 80', stack: true,
    desc: '하루 끝에 폭 안기는 침대예요.',
    svg: '<path d="M10 66V22q0-12 12-12h4q12 0 12 12v22"/><path d="M10 44h100q4 0 4 4v16q0 4-4 4H10z"/><path d="M14 68v8M108 68v8" fill="none"/><ellipse cx="25" cy="38" rx="11" ry="6"/><path d="M42 44q24-10 68 0" fill="none"/><path d="M60 54q4 4 8 0M84 56q4 4 8 0" fill="none"/>' },
  { id: 'chair_wood', name: '나무 의자', cat: 'furniture', type: 'furniture', price: 40, w: 10, vb: '0 0 60 90', stack: true,
    desc: '등받이가 동글동글한 의자.',
    svg: '<path d="M14 10q0-6 6-6h2q4 0 4 6v42H14z"/><path d="M10 52h40q4 0 4 4v4q0 4-4 4H10q-4 0-4-4v-4q0-4 4-4z"/><path d="M12 64l-2 22M48 64l2 22M19 64l1 18M41 64l-1 18" fill="none"/>' },
  { id: 'desk_small', name: '작은 책상', cat: 'furniture', type: 'furniture', price: 80, w: 22, vb: '0 0 110 80', stack: true,
    desc: '편지를 쓰기 딱 좋은 크기.',
    svg: '<rect x="6" y="20" width="98" height="10" rx="4"/><path d="M12 30v46M98 30v46" fill="none"/><rect x="62" y="30" width="32" height="26" rx="3"/><path d="M74 43h8" fill="none"/>' },
  { id: 'sofa', name: '몽글 소파', cat: 'furniture', type: 'furniture', price: 180, w: 32, vb: '0 0 140 80', stack: true,
    desc: '구름처럼 푹신한 2인용 소파.',
    svg: '<path d="M22 50V24q0-12 12-12h72q12 0 12 12v26z"/><path d="M8 40q0-10 10-10t10 10v28H8z"/><path d="M112 40q0-10 10-10t10 10v28h-20z"/><path d="M28 48h84v20H28z"/><path d="M70 48v20M70 18v28" fill="none"/><path d="M14 68v6M126 68v6" fill="none"/>' },
  { id: 'bookshelf', name: '키다리 책장', cat: 'furniture', type: 'furniture', price: 150, w: 14, vb: '0 0 70 110', stack: true,
    desc: '좋아하는 이야기를 꽂아두세요.',
    svg: '<rect x="6" y="4" width="58" height="102" rx="4"/><path d="M6 38h58M6 72h58" fill="none"/><path d="M14 36V16M20 36V13M26 36V18M38 36l8-20M14 70V50M22 70V47M44 70V52M52 70V49M16 104V82M24 104V84M30 104V80" fill="none"/>' },
  { id: 'table_round', name: '동그란 탁자', cat: 'furniture', type: 'furniture', price: 70, w: 18, vb: '0 0 100 70', stack: true,
    desc: '차 한 잔 올려두기 좋아요.',
    svg: '<path d="M50 30v32M32 66q18-9 36 0" fill="none"/><ellipse cx="50" cy="20" rx="44" ry="10"/>' },
  // 조명
  { id: 'lamp_stand', name: '스탠드 조명', cat: 'lighting', type: 'furniture', price: 60, w: 9, vb: '0 0 50 120', stack: true,
    desc: '밤에도 포근한 불빛.',
    svg: '<path d="M25 36v72" fill="none"/><ellipse cx="25" cy="112" rx="16" ry="4"/><path d="M10 36l7-28h16l7 28z"/><path d="M6 46l-4 4M44 46l4 4M25 42v6" fill="none"/>' },
  { id: 'lamp_ceiling', name: '천장등', cat: 'lighting', type: 'furniture', price: 90, w: 12, vb: '0 0 70 80', stack: true, wallOnly: true,
    desc: '방 위쪽에 매달아 보세요.',
    svg: '<path d="M35 0v30" fill="none"/><path d="M10 52q0-22 25-22t25 22z"/><path d="M28 52q7 8 14 0" fill="none"/><path d="M14 62l-6 8M35 64v10M56 62l6 8" fill="none"/>' },
  // 장식
  { id: 'plant_small', name: '작은 화분', cat: 'deco', type: 'furniture', price: 30, w: 9, vb: '0 0 60 90', stack: true,
    desc: '물을 주지 않아도 시들지 않아요.',
    svg: '<path d="M30 56q-2-20-18-30 10 20 18 30z"/><path d="M30 56q4-24 20-34-8 22-20 34z"/><path d="M30 56V22q-7-8 0-16 7 8 0 16"/><path d="M14 56h32l-4 30H18z"/>' },
  { id: 'frame', name: '그림 액자', cat: 'deco', type: 'furniture', price: 50, w: 12, vb: '0 0 70 60', stack: true, wallOnly: true,
    desc: '좋아하는 풍경을 벽에 걸어요.',
    svg: '<rect x="4" y="4" width="62" height="52" rx="3"/><rect x="12" y="12" width="46" height="36" rx="2"/><path d="M14 46l12-14 8 8 8-10 14 16" fill="none"/><circle cx="46" cy="22" r="4"/>' },
  { id: 'teddy', name: '곰 인형', cat: 'deco', type: 'furniture', price: 70, w: 10, vb: '0 0 70 80', stack: true,
    desc: '말없이 들어주는 친구.',
    svg: '<circle cx="18" cy="14" r="8"/><circle cx="52" cy="14" r="8"/><ellipse cx="35" cy="56" rx="22" ry="20"/><circle cx="35" cy="28" r="18"/><ellipse cx="35" cy="34" rx="7" ry="5"/><circle cx="28" cy="25" r="1.6" fill="#222"/><circle cx="42" cy="25" r="1.6" fill="#222"/><ellipse cx="16" cy="72" rx="9" ry="6"/><ellipse cx="54" cy="72" rx="9" ry="6"/>' },
  { id: 'rug', name: '동그라미 러그', cat: 'deco', type: 'furniture', price: 60, w: 34, vb: '0 0 140 40', stack: true,
    desc: '바닥에 깔면 방이 포근해져요.',
    svg: '<ellipse cx="70" cy="20" rx="64" ry="15"/><ellipse cx="70" cy="20" rx="46" ry="9" fill="none"/><ellipse cx="70" cy="20" rx="24" ry="4" fill="none"/>' },
  { id: 'window_curtain', name: '커튼 창문', cat: 'interior', type: 'furniture', price: 100, w: 20, vb: '0 0 90 80', stack: true, wallOnly: true,
    desc: '바람이 살랑이는 창문 장식.',
    svg: '<rect x="12" y="8" width="66" height="58" rx="4"/><path d="M45 8v58M12 37h66M4 4h82" fill="none"/><path d="M6 4q8 30 0 66 10 0 16-4-6-30 0-62z"/><path d="M84 4q-8 30 0 66-10 0-16-4 6-30 0-62z"/>' },
  // 생활 소품
  { id: 'books', name: '책 더미', cat: 'life', type: 'furniture', price: 25, w: 9, vb: '0 0 60 50', stack: true,
    desc: '읽다 만 책들이 쌓여 있어요.',
    svg: '<rect x="6" y="34" width="48" height="10" rx="2"/><rect x="10" y="22" width="40" height="12" rx="2"/><rect x="8" y="10" width="44" height="12" rx="2"/><path d="M14 39h28M18 28h22M14 16h26" fill="none"/>' },
  { id: 'cup', name: '머그컵', cat: 'life', type: 'furniture', price: 15, w: 6, vb: '0 0 50 50', stack: true,
    desc: '김이 모락모락.',
    svg: '<path d="M34 20q10 0 10 7t-10 7" fill="none"/><path d="M10 16h24v20q0 8-8 8h-8q-8 0-8-8z"/><path d="M18 10q-3-4 0-8M26 10q-3-4 0-8" fill="none"/>' },
  { id: 'clock', name: '벽시계', cat: 'life', type: 'furniture', price: 45, w: 9, vb: '0 0 60 60', stack: true, wallOnly: true,
    desc: '천천히 흘러가는 시간.',
    svg: '<circle cx="30" cy="30" r="25"/><path d="M30 30V14M30 30h11M30 8v3M30 49v3M8 30h3M49 30h3" fill="none"/>' },
  // 계절
  { id: 'snowman', name: '눈사람', cat: 'season', type: 'furniture', price: 80, w: 10, vb: '0 0 60 90', stack: true,
    desc: '겨울 한정! 녹지 않는 눈사람.',
    svg: '<circle cx="30" cy="62" r="22"/><circle cx="30" cy="26" r="15"/><path d="M18 12h24M22 12V2h16v10"/><circle cx="25" cy="24" r="1.6" fill="#222"/><circle cx="35" cy="24" r="1.6" fill="#222"/><path d="M30 29l8 2-8 1M8 50L1 42M52 50l7-8" fill="none"/><circle cx="30" cy="56" r="1.6" fill="#222"/><circle cx="30" cy="66" r="1.6" fill="#222"/>' },
  { id: 'tulip', name: '튤립 화분', cat: 'season', type: 'furniture', price: 55, w: 9, vb: '0 0 60 90', stack: true,
    desc: '봄 내음이 나는 튤립.',
    svg: '<path d="M30 60V30M30 50q-12-4-14-14 10 2 14 10M30 46q10-6 14-14-10 2-14 10" fill="none"/><path d="M20 14l5 6 5-10 5 10 5-6v12q0 8-10 8t-10-8z"/><path d="M16 60h28l-4 26H20z"/>' },

  // 벽지
  { id: 'wall_plain', name: '하얀 벽지', cat: 'interior', type: 'wallpaper', price: 0, stack: false, desc: '깨끗한 기본 벽지.',
    bg: '#fff' },
  { id: 'wall_stripe', name: '줄무늬 벽지', cat: 'interior', type: 'wallpaper', price: 80, stack: false, desc: '연필로 쓱쓱 그은 세로 줄.',
    bg: 'repeating-linear-gradient(90deg, #fff 0 26px, #c9c7c0 26px 28px)' },
  { id: 'wall_dots', name: '물방울 벽지', cat: 'interior', type: 'wallpaper', price: 80, stack: false, desc: '콕콕 찍은 작은 점들.',
    bg: 'radial-gradient(#9d9b94 1.6px, transparent 2.2px) 0 0 / 22px 22px, #fff' },
  { id: 'wall_check', name: '체크 벽지', cat: 'interior', type: 'wallpaper', price: 100, stack: false, desc: '공책 같은 바둑판 무늬.',
    bg: 'linear-gradient(#d3d1ca 1.5px, transparent 1.5px) 0 0 / 30px 30px, linear-gradient(90deg, #d3d1ca 1.5px, #fff 1.5px) 0 0 / 30px 30px' },
  // 바닥
  { id: 'floor_wood', name: '나무 마루', cat: 'interior', type: 'floor', price: 0, stack: false, desc: '기본 나무 바닥.',
    bg: 'repeating-linear-gradient(0deg, #fff 0 22px, #b9b7b0 22px 24px)' },
  { id: 'floor_tile', name: '타일 바닥', cat: 'interior', type: 'floor', price: 80, stack: false, desc: '네모네모 타일.',
    bg: 'linear-gradient(#b9b7b0 2px, transparent 2px) 0 0 / 40px 28px, linear-gradient(90deg, #b9b7b0 2px, #fff 2px) 0 0 / 40px 28px' },
  { id: 'floor_herring', name: '헤링본 바닥', cat: 'interior', type: 'floor', price: 120, stack: false, desc: '지그재그 나무 무늬.',
    bg: 'repeating-linear-gradient(45deg, #fff 0 14px, #b9b7b0 14px 16px), #fff' },
];

/* 첫 입주 보상 — 무료 기본 가구와 시작 재화 (PRD 5.3) */
const STARTER = {
  freeCoins: 300,
  items: ['bed_basic', 'chair_wood', 'desk_small', 'plant_small', 'lamp_stand', 'cup', 'wall_plain', 'floor_wood'],
  wallpaper: 'wall_plain',
  floor: 'floor_wood',
};

/* 충전 상품 — 기획 초기 검토용 예시 금액 */
const CHARGE_PRODUCTS = [
  { id: 'p_1000', name: '몽글 한 줌', price: 1000, coins: 100 },
  { id: 'p_5000', name: '몽글 한 봉지', price: 5000, coins: 550 },
  { id: 'p_10000', name: '몽글 한 바구니', price: 10000, coins: 1150 },
  { id: 'p_30000', name: '몽글 한 상자', price: 30000, coins: 3600 },
];

/* 마을 집 — 단독주택(관리자 설정) + 10가구 아파트 */
const HOUSE_NAMES = ['해바라기집', '구름빵집', '도토리집', '민들레집', '조약돌집', '솔방울집', '달맞이집', '보리밭집'];
const HOMES = [
  { id: 'h1', kind: 'house', no: 1, x: 40, y: 60, style: 0 },
  { id: 'h2', kind: 'house', no: 2, x: 215, y: 50, style: 1 },
  { id: 'h3', kind: 'house', no: 3, x: 390, y: 64, style: 2 },
  { id: 'h4', kind: 'house', no: 4, x: 40, y: 330, style: 1 },
  { id: 'h5', kind: 'house', no: 5, x: 215, y: 340, style: 2 },
  { id: 'h6', kind: 'house', no: 6, x: 390, y: 326, style: 0 },
  { id: 'h7', kind: 'house', no: 7, x: 110, y: 540, style: 2 },
  { id: 'h8', kind: 'house', no: 8, x: 330, y: 548, style: 1 },
].map((h, i) => ({ ...h, name: HOUSE_NAMES[i], address: `몽글마을 ${h.no}번지` }));
for (let floor = 1; floor <= 5; floor++) {
  for (let n = 1; n <= 2; n++) {
    const no = floor * 100 + n;
    HOMES.push({ id: 'a' + no, kind: 'apt', no, floor, col: n, name: `몽글아파트 ${no}호`, address: `몽글마을 9번지 몽글아파트 ${no}호` });
  }
}

/* 미리 살고 있는 이웃(데모용) */
const NEIGHBORS = [
  { id: 'npc_gureum', nickname: '구름이', bio: '하늘 보는 걸 좋아해요. 쪽지 환영!', home: 'h2', bioPublic: true, msgFrom: 'all',
    layout: { wallpaper: 'wall_dots', floor: 'floor_wood', placed: [['sofa', 30, 52], ['window_curtain', 38, 10], ['rug', 30, 82], ['plant_small', 70, 50], ['teddy', 46, 48]] } },
  { id: 'npc_somsatang', nickname: '솜사탕', bio: '달콤한 하루 보내세요 :)', home: 'h5', bioPublic: true, msgFrom: 'all',
    layout: { wallpaper: 'wall_stripe', floor: 'floor_tile', placed: [['bed_basic', 8, 50], ['lamp_stand', 44, 36], ['frame', 60, 14], ['tulip', 80, 56]] } },
  { id: 'npc_dalpaengi', nickname: '달팽이', bio: '천천히, 하지만 꾸준히.', home: 'a201', bioPublic: false, msgFrom: 'all',
    layout: { wallpaper: 'wall_check', floor: 'floor_herring', placed: [['bookshelf', 10, 30], ['desk_small', 40, 52], ['chair_wood', 62, 52], ['clock', 45, 12], ['books', 44, 44]] } },
  { id: 'npc_boricha', nickname: '보리차', bio: '친구에게만 쪽지를 받아요.', home: 'a302', bioPublic: true, msgFrom: 'friends',
    layout: { wallpaper: 'wall_plain', floor: 'floor_wood', placed: [['table_round', 40, 60], ['cup', 47, 55], ['lamp_ceiling', 44, 0], ['plant_small', 12, 52]] } },
  { id: 'npc_noeul', nickname: '노을', bio: '저녁 산책 메이트 구해요.', home: 'h7', bioPublic: true, msgFrom: 'all',
    layout: { wallpaper: 'wall_stripe', floor: 'floor_herring', placed: [['window_curtain', 10, 10], ['sofa', 40, 52], ['snowman', 84, 52]] } },
  { id: 'npc_tokki', nickname: '토끼풀', bio: '네잎클로버 찾는 중', home: 'a501', bioPublic: true, msgFrom: 'none',
    layout: { wallpaper: 'wall_dots', floor: 'floor_tile', placed: [['bed_basic', 52, 50], ['teddy', 20, 55], ['tulip', 8, 56]] } },
];

const NPC_REPLIES = [
  '쪽지 고마워요! 오늘 하루도 몽글몽글했나요?',
  '반가워요, 이웃님. 나중에 우리 집에도 놀러 와요 :)',
  '와, 쪽지 받으니까 기분이 좋아졌어요!',
  '요즘 날씨가 좋아서 산책하기 딱이에요. 이웃님은 어때요?',
  '방 구경 잘 했어요. 가구 배치 센스 최고!',
];

const REPORT_REASONS = ['욕설·비하', '스팸·광고', '불쾌한 내용', '개인정보 요구', '기타'];
