import { ITEM_DEFS } from '../entities/PassiveItem';

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

function _entryToSlot(entry, excludeItemIds) {
  if (entry.kind === 'item') {
    // 생성 시점에 패시브 1개 미리 선정 → 카드에 실제 이름/설명 표시
    const ids = Object.keys(ITEM_DEFS).filter(id => !excludeItemIds.has(id));
    if (ids.length === 0) return null; // 가용 패시브 없음 — 호출부에서 다른 엔트리 재추첨
    const id  = ids[Math.floor(Math.random() * ids.length)];
    const def = ITEM_DEFS[id];
    return {
      kind: 'item', id, name: def.name, desc: def.desc, color: def.color,
      cost: 45, sold: false,
    };
  }
  if (entry.kind === 'heal') {
    const t = HEAL_TIERS[entry.tierIdx];
    return { kind: 'heal', id: t.id, name: t.name, amount: t.amount, cost: t.cost, sold: false };
  }
  if (entry.kind === 'heal_pct') {
    return { kind: 'heal_pct', id: entry.id, name: entry.name, ratio: entry.ratio, cost: entry.cost, sold: false };
  }
  return { kind: 'heal_full', id: entry.id, name: entry.name, cost: entry.cost, sold: false };
}

/**
 * 슬롯 무작위 추첨 (기본 3개 + 영구 해금 보너스).
 *  - 슬롯 간 같은 id 중복 금지 (heal_1 과 heal_1 같이 들어가지 않음)
 *  - ownedItemIds: 플레이어가 이미 보유한 패시브 id 목록 — 해당 패시브는 'item' 슬롯에서 제외
 *  - extraSlots: '상인의 호의' 등 영구 해금으로 부여되는 추가 슬롯 수
 */
function _generateShopSlots(ownedItemIds = [], extraSlots = 0) {
  const targetCount = 3 + Math.max(0, extraSlots);
  const slots = [];
  const usedKey = new Set();
  const excludeItems = new Set(ownedItemIds); // 보유 패시브 + 이미 이 상점에 들어간 패시브
  let attempts = 0;
  const maxAttempts = targetCount * 14; // 3슬롯 기준 40회 유지 비율
  while (slots.length < targetCount && attempts < maxAttempts) {
    attempts++;
    const entry = _pickShopEntry();
    const slot  = _entryToSlot(entry, excludeItems);
    if (!slot || usedKey.has(slot.id)) continue;
    slots.push(slot);
    usedKey.add(slot.id);
    if (slot.kind === 'item') excludeItems.add(slot.id);
  }
  return slots;
}

/**
 * 랜덤 워크로 9~12개 방을 배치하고 인접 연결.
 * floorNum 이 2 또는 4 일 때 일반 전투방 하나를 상점방으로 치환.
 * ownedItemIds: 상점 패시브 슬롯 추첨에서 제외할 보유 아이템 id 목록.
 * extraShopSlots: 영구 해금 '상인의 호의' 등으로 기본 3슬롯에 더할 추가 슬롯 수.
 * Phaser 의존 없는 순수 데이터 함수.
 */
export function generateDungeon(floorNum = 1, targetCount, ownedItemIds = [], extraShopSlots = 0) {
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

  // 짝수층(2·4)에 상점방 1개 — 보스·시작·이미 지정된 방 제외, 시작방 가까운 쪽 우선
  if (floorNum === 2 || floorNum === 4) {
    const cand = rooms
      .filter(r => r.type === 'combat')
      .map(r => ({ r, d: bfsDist.get(r.id) ?? Infinity }))
      .sort((a, b) => a.d - b.d);
    if (cand.length > 0) {
      const half = Math.max(1, Math.ceil(cand.length / 2));
      const pool = cand.slice(0, half);
      const picked = pool[Math.floor(Math.random() * pool.length)];
      picked.r.type = 'shop';
      picked.r.shopSlots = _generateShopSlots(ownedItemIds, extraShopSlots);
    }
  }

  return { rooms, startId: 0, grid, gridCols: GRID_COLS, gridRows: GRID_ROWS };
}
