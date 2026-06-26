import { ITEM_DEFS } from '../entities/PassiveItem';
import { VAULT_FLOOR_MAP } from '../data/Vaults';

const GRID_COLS = 8;
const GRID_ROWS = 6;

const DIRS = [
  { dc:  0, dr: -1, dir: 'up',    opp: 'down'  },
  { dc:  0, dr:  1, dir: 'down',  opp: 'up'    },
  { dc: -1, dr:  0, dir: 'left',  opp: 'right' },
  { dc:  1, dr:  0, dir: 'right', opp: 'left'  },
];

// ── 상점 슬롯 풀 ──────────────────────────────────────
// 정액 회복 (1코어 ≈ 1.6 HP 비례), 50% 회복, 전체 회복, 패시브 아이템
const HEAL_TIERS = [
  { id: 'heal_1', name: '토끼풀 한 줌',    cost: 5,  amount: 8  },
  { id: 'heal_2', name: '민들레잎',        cost: 10, amount: 16 },
  { id: 'heal_3', name: '무 조각',         cost: 15, amount: 24 },
  { id: 'heal_4', name: '잘 익은 당근',    cost: 20, amount: 32 },
  { id: 'heal_5', name: '사과 조각',       cost: 25, amount: 40 },
  { id: 'heal_6', name: '빨간 사과',       cost: 30, amount: 48 },
  { id: 'heal_7', name: '야생 베리 한 줌', cost: 35, amount: 56 },
  { id: 'heal_8', name: '채소 샐러드',     cost: 40, amount: 64 },
];

// 가중치: 패시브 30, 정액 회복 8단계 합 55(균등), heal_half 10, heal_full 5
const SHOP_POOL = [
  { kind: 'item',                                                                weight: 30 },
  ...HEAL_TIERS.map((_, i) => ({ kind: 'heal', tierIdx: i, weight: 55 / 8 })),
  { kind: 'heal_pct',  id: 'heal_half', name: '푸짐한 한 끼', ratio: 0.5, cost: 50, weight: 10 },
  { kind: 'heal_full', id: 'heal_full', name: '정원의 만찬',               cost: 75, weight: 5  },
];

function _pickShopEntry() {
  const total = SHOP_POOL.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const entry of SHOP_POOL) {
    r -= entry.weight;
    if (r <= 0) return entry;
  }
  return SHOP_POOL[SHOP_POOL.length - 1];
}

function _entryToSlot(entry, excludeItemIds, priceMult = 1) {
  // 가격 할인 — Math.floor 로 처리, 최소 1 보장. priceMult 가 1 이면 원가 유지.
  const price = (raw) => priceMult === 1 ? raw : Math.max(1, Math.floor(raw * priceMult));

  if (entry.kind === 'item') {
    // 생성 시점에 패시브 1개 미리 선정 → 카드에 실제 이름/설명 표시.
    // 스택형(코어 결정체)은 보유 중이어도 항상 후보 — 가격은 일반 패시브와 동일(60).
    const ids = Object.keys(ITEM_DEFS).filter(id => !excludeItemIds.has(id) || ITEM_DEFS[id].stackable);
    if (ids.length === 0) return null; // 가용 패시브 없음 — 호출부에서 다른 엔트리 재추첨
    const id  = ids[Math.floor(Math.random() * ids.length)];
    const def = ITEM_DEFS[id];
    return {
      kind: 'item', id, name: def.name, desc: def.desc, color: def.color,
      cost: price(60), sold: false,
    };
  }
  if (entry.kind === 'heal') {
    const t = HEAL_TIERS[entry.tierIdx];
    return { kind: 'heal', id: t.id, name: t.name, amount: t.amount, cost: price(t.cost), sold: false };
  }
  if (entry.kind === 'heal_pct') {
    return { kind: 'heal_pct', id: entry.id, name: entry.name, ratio: entry.ratio, cost: price(entry.cost), sold: false };
  }
  return { kind: 'heal_full', id: entry.id, name: entry.name, cost: price(entry.cost), sold: false };
}

/**
 * 슬롯 무작위 추첨 (기본 3개 + 영구 해금 보너스).
 *  - 슬롯 간 같은 id 중복 금지 (heal_1 과 heal_1 같이 들어가지 않음)
 *  - ownedItemIds: 플레이어가 이미 보유한 패시브 id 목록 — 해당 패시브는 'item' 슬롯에서 제외
 *  - extraSlots: '상인의 호의' 등 영구 해금으로 부여되는 추가 슬롯 수
 *  - priceMult: '상인의 신용' 해금 시 0.8 — 모든 슬롯 cost 에 곱하고 floor (최소 1)
 */
function _generateShopSlots(ownedItemIds = [], extraSlots = 0, priceMult = 1) {
  const targetCount = 3 + Math.max(0, extraSlots);
  const slots = [];
  const usedKey = new Set();
  const excludeItems = new Set(ownedItemIds); // 보유 패시브 + 이미 이 상점에 들어간 패시브
  let attempts = 0;
  const maxAttempts = targetCount * 14; // 3슬롯 기준 40회 유지 비율
  while (slots.length < targetCount && attempts < maxAttempts) {
    attempts++;
    const entry = _pickShopEntry();
    const slot  = _entryToSlot(entry, excludeItems, priceMult);
    if (!slot || usedKey.has(slot.id)) continue;
    slots.push(slot);
    usedKey.add(slot.id);
    if (slot.kind === 'item') excludeItems.add(slot.id);
  }
  return slots;
}

/**
 * 부술 수 있는 장애물(stump) 드롭 추첨 — 상점 카탈로그(패시브 + 회복) 단일 출처 재사용.
 * 가격 역가중(weight = WEIGHT_BASE / cost)이라 비싼 아이템일수록 확률이 낮다.
 * 패시브는 미보유분만(스택형은 항상 포함). 반환은 스폰용 descriptor:
 *   { kind:'item', id } | { kind:'heal', amount } | { kind:'heal_pct', ratio } | { kind:'heal_full' }
 */
export function pickPriceWeightedDrop(ownedItemIds = []) {
  const owned = new Set(ownedItemIds);
  const WEIGHT_BASE = 100; // 튜닝 상수
  const entries = [];
  for (const id of Object.keys(ITEM_DEFS)) {
    if (owned.has(id) && !ITEM_DEFS[id].stackable) continue;
    entries.push({ kind: 'item', id, cost: 60 });
  }
  for (const t of HEAL_TIERS) entries.push({ kind: 'heal', amount: t.amount, cost: t.cost });
  entries.push({ kind: 'heal_pct', ratio: 0.5, cost: 50 });
  entries.push({ kind: 'heal_full',            cost: 75 });

  const weighted = entries.map(e => ({ e, w: WEIGHT_BASE / e.cost }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const { e, w } of weighted) { r -= w; if (r <= 0) return e; }
  return weighted[weighted.length - 1].e;
}

// ── 비밀방 헬퍼 ───────────────────────────────────────

const OPP_DIR = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SECRET_CACHE_CHANCE_BASE = 0.5;  // 1층 보물방 출현 확률 (기본 50%)
const SECRET_CACHE_CHANCE_MAX  = 0.75; // 출현 확률 상한 (75%)
const SECRET_CACHE_CHANCE_STEP = 0.03; // 층당 증가폭 — 10층부터 상한 도달
// 기억 보관실 고정 층(VAULT_FLOOR_MAP)·메타데이터는 src/data/Vaults.js 단일 출처에서 가져온다.

/** combat 방에서 도어가 없는 방향 중 하나를 무작위 반환. 없으면 null. */
function _getFreeWallDir(room) {
  const free = ['up', 'down', 'left', 'right'].filter(
    d => room.doors[d] === null && room.secretDoor?.dir !== d,
  );
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

/** 보물방 보상 아이템 선정 (미보유 패시브 우선, 없으면 회복) */
function _pickCacheReward(ownedItemIds) {
  const ids = Object.keys(ITEM_DEFS).filter(id => !(ownedItemIds ?? []).includes(id));
  if (ids.length === 0) return { kind: 'heal', amount: 30 };
  return { kind: 'item', id: ids[Math.floor(Math.random() * ids.length)] };
}

/** 비밀방(secret_cache / secret_vault)을 rooms 배열에 추가하고 부모 방에 secretDoor 프로퍼티를 부여 */
function _addSecretRooms(rooms, floorNum, ownedItemIds) {
  function makeSecretRoom(parent, dir, type, extra) {
    const r = {
      id: rooms.length, col: null, row: null,
      type, doors: { up: null, down: null, left: null, right: null },
      cleared: false, visited: false,
      secretEntry: { parentId: parent.id, fromDir: dir },
      ...extra,
    };
    r.doors[OPP_DIR[dir]] = parent.id;
    rooms.push(r);
    parent.secretDoor = { dir, roomId: r.id, targetType: type };
  }

  // 보물방 — 층 진행에 따라 50% → 75%(상한)
  const cacheChance = Math.min(
    SECRET_CACHE_CHANCE_MAX,
    SECRET_CACHE_CHANCE_BASE + (floorNum - 1) * SECRET_CACHE_CHANCE_STEP,
  );
  if (Math.random() < cacheChance) {
    const pool = rooms
      .filter(r => r.type === 'combat')
      .map(r => ({ r, dir: _getFreeWallDir(r) }))
      .filter(({ dir }) => dir !== null);
    if (pool.length > 0) {
      const { r: parent, dir } = pool[Math.floor(Math.random() * pool.length)];
      // 보물방(loot) / 제단방(altar) / 엘리트방(elite) = 각 1/3
      const roll = Math.random();
      const subtype = roll < 1 / 3 ? 'loot' : roll < 2 / 3 ? 'altar' : 'elite';
      const reward  = subtype === 'loot' ? _pickCacheReward(ownedItemIds) : null;
      makeSecretRoom(parent, dir, 'secret_cache', { cacheSubtype: subtype, cacheReward: reward });
    }
  }

  // 기억 보관실 — 특정 층 고정
  const vaultIdx = VAULT_FLOOR_MAP[floorNum];
  if (vaultIdx !== undefined) {
    const pool = rooms
      .filter(r => r.type === 'combat' && !r.secretDoor)
      .map(r => ({ r, dir: _getFreeWallDir(r) }))
      .filter(({ dir }) => dir !== null);
    if (pool.length > 0) {
      const { r: parent, dir } = pool[Math.floor(Math.random() * pool.length)];
      makeSecretRoom(parent, dir, 'secret_vault', { vaultIdx });
    }
  }
}

/**
 * 랜덤 워크로 9~12개 방을 배치하고 인접 연결.
 * floorNum 이 2 또는 4 일 때 일반 전투방 하나를 상점방으로 치환.
 * ownedItemIds: 상점 패시브 슬롯 추첨에서 제외할 보유 아이템 id 목록.
 * extraShopSlots: 영구 해금 '상인의 호의' 등으로 기본 3슬롯에 더할 추가 슬롯 수.
 * shopPriceMult: 영구 해금 '상인의 신용' 등으로 모든 상점 가격에 곱할 배율 (기본 1).
 * Phaser 의존 없는 순수 데이터 함수.
 */
export function generateDungeon(
  floorNum = 1, targetCount, ownedItemIds = [], extraShopSlots = 0, shopPriceMult = 1,
) {
  targetCount ??= 9 + Math.floor(Math.random() * 4); // 9-12

  const grid  = new Map(); // "col,row" → roomData
  const rooms = [];

  const key    = (c, r) => `${c},${r}`;
  const inGrid = (c, r) => c >= 0 && c < GRID_COLS && r >= 0 && r < GRID_ROWS;

  const addRoom = (col, row, type = 'combat') => {
    const k = key(col, row);
    if (grid.has(k)) return null;
    const data = {
      id:      rooms.length,
      col, row, type,
      doors:   { up: null, down: null, left: null, right: null },
      cleared: type === 'start',
      visited: false,
    };
    grid.set(k, data);
    rooms.push(data);
    return data;
  };

  // 시작방: 격자 중앙
  const sc = Math.floor(GRID_COLS / 2);
  const sr = Math.floor(GRID_ROWS / 2);
  addRoom(sc, sr, 'start');

  let col = sc, row = sr;

  while (rooms.length < targetCount) {
    const free = DIRS.filter(d => inGrid(col + d.dc, row + d.dr) && !grid.has(key(col + d.dc, row + d.dr)));

    if (free.length === 0) {
      // 막다른 곳 → 빈 이웃이 있는 기존 방으로 이동
      const candidates = rooms.filter(r =>
        DIRS.some(d => inGrid(r.col + d.dc, r.row + d.dr) && !grid.has(key(r.col + d.dc, r.row + d.dr)))
      );
      if (!candidates.length) break;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      col = pick.col; row = pick.row;
      continue;
    }

    const d = free[Math.floor(Math.random() * free.length)];
    col += d.dc;
    row += d.dr;
    addRoom(col, row);
  }

  // 인접한 방끼리 문 연결
  rooms.forEach(room => {
    DIRS.forEach(({ dc, dr, dir }) => {
      const nb = grid.get(key(room.col + dc, room.row + dr));
      if (nb) room.doors[dir] = nb.id;
    });
  });

  // 시작방에서 가장 먼 방을 보스방으로 지정 (BFS)
  const bfsDist = new Map([[0, 0]]);
  const bfsQ    = [0];
  while (bfsQ.length > 0) {
    const cur = bfsQ.shift();
    Object.values(rooms[cur].doors).forEach(nid => {
      if (nid !== null && !bfsDist.has(nid)) {
        bfsDist.set(nid, bfsDist.get(cur) + 1);
        bfsQ.push(nid);
      }
    });
  }
  let maxD = 0, bossId = 0;
  bfsDist.forEach((d, id) => { if (d > maxD) { maxD = d; bossId = id; } });
  rooms[bossId].type = 'boss';

  // 상점방 1개 — 구역 1: 2·4·7·9층 / 구역 2: 12·14·17·19층
  if (floorNum === 2 || floorNum === 4 || floorNum === 7 || floorNum === 9
      || floorNum === 12 || floorNum === 14 || floorNum === 17 || floorNum === 19) {
    const cand = rooms
      .filter(r => r.type === 'combat')
      .map(r => ({ r, d: bfsDist.get(r.id) ?? Infinity }))
      .sort((a, b) => a.d - b.d);
    if (cand.length > 0) {
      const half = Math.max(1, Math.ceil(cand.length / 2));
      const pool = cand.slice(0, half);
      const picked = pool[Math.floor(Math.random() * pool.length)];
      picked.r.type = 'shop';
      picked.r.shopSlots = _generateShopSlots(ownedItemIds, extraShopSlots, shopPriceMult);
    }
  }

  _addSecretRooms(rooms, floorNum, ownedItemIds);

  return { rooms, startId: 0, grid, gridCols: GRID_COLS, gridRows: GRID_ROWS };
}
