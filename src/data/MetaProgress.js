/**
 * 메타 progression — 런 간 영속되는 코어/해금 상태.
 *
 * localStorage 키:
 *   lagomorph_meta_cores      메타 코어 잔량 (정수, 음수 불가)
 *   lagomorph_unlock_nodes    해금된 UNLOCK_NODES id 배열
 *   lagomorph_shop_discovered 상점방을 한 번이라도 진입했는지 (bool) — Hub NPC 등장 조건
 *
 * 메타 코어 적립 규칙 (보존율 모델):
 *   - 게임 시작 시 부여되는 기본 코어(30) 및 점화의 잔해 추가 코어도 _runPicked 에 포함
 *   - 런 중 픽업한 코어는 즉시 적립되지 않고 _runPicked 카운터에만 누적
 *     (EnemyManager.update() 의 픽업 분기에서 addRunPickup() 호출)
 *   - 런 종료 시 commitMetaRun() 으로 정산: 클리어=픽업분 100%, 사망=보존율(기본 20%)만 적립
 *   - 보존율은 Player.metaRetainRate (잔해 회수 해금으로 +5%p 씩 상승)
 */

import { UNLOCK_NODES } from './UnlockTree';

const META_CORES_KEY       = 'lagomorph_meta_cores';
const UNLOCK_NODES_KEY     = 'lagomorph_unlock_nodes';
const SHOP_DISCOVERED_KEY  = 'lagomorph_shop_discovered';
const PASSIVE_ITEMS_KEY    = 'lagomorph_unlocked'; // PassiveItem.js 와 키 공유 — 초기화 대상에 포함

// ── 메타 코어 ────────────────────────────────────────

export function getMetaCores() {
  try {
    const v = parseInt(localStorage.getItem(META_CORES_KEY) || '0', 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch { return 0; }
}

export function setMetaCores(n) {
  const v = Math.max(0, Math.floor(n));
  try { localStorage.setItem(META_CORES_KEY, String(v)); } catch {}
  return v;
}

/** delta 만큼 가감 (음수 허용 — 해금 구매 시 차감). 최종값 반환. */
export function addMetaCores(delta) {
  return setMetaCores(getMetaCores() + delta);
}

// ── 런 단위 픽업 정산 (보존율 모델) ──────────────────
//
// 픽업은 즉시 영속 적립되지 않고 모듈 상태 _runPicked 에만 쌓인다.
// 런 종료(사망/클리어) 시 commitMetaRun() 으로 보존율을 적용해 영속 적립한다.

let _runPicked = 0;

/** 런 시작 시 호출 — 픽업 카운터 리셋. */
export function beginMetaRun() { _runPicked = 0; }

/** 코어 픽업 시 호출 (EnemyManager). */
export function addRunPickup(n = 1) { _runPicked += n; }

/** 현재 런에서 픽업한 코어 수. */
export function getRunPicked() { return _runPicked; }

/**
 * 런 종료 정산. survived=true → 픽업분 전량, false → retainRate 비율만 영속 적립.
 * { picked, gained } 반환 후 카운터를 리셋한다 (중복 호출 시 두 번째는 0 적립 — 안전).
 */
export function commitMetaRun(survived, retainRate = 0.25) {
  const picked = _runPicked;
  const rate   = survived ? 1 : Math.max(0, Math.min(1, retainRate));
  const gained = Math.floor(picked * rate);
  addMetaCores(gained);
  _runPicked = 0;
  return { picked, gained };
}

// ── 해금 노드 ────────────────────────────────────────

export function getUnlockedNodes() {
  try {
    const raw = JSON.parse(localStorage.getItem(UNLOCK_NODES_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(id => UNLOCK_NODES[id]) : [];
  } catch { return []; }
}

/**
 * 현재 해금된 노드를 모두 적용했을 때의 런 시작 스탯을 반환.
 * UnlockMenu 등 플레이어 인스턴스가 없는 곳에서 dynDesc 계산용으로 사용.
 */
export function computeUnlockStats() {
  const stats = {
    meleeDamageMult: 1.0, meleeRadiusMult: 1.0, chargeSpeedMult: 1.0,
    critRate: 0.15, critMult: 1.5,
    maxHp: 100, hp: 100, armor: 0,
    shopSlotBonus: 0, shopPriceMult: 1.0,
    metaRetainRate: 0.25, coreDropMult: 1.0,
    trapMaxBonus: 0, startingCores: 0,
    hpPerRoomClear: 0, damageReduction: 0,
    extraLives: 0, invulnDurationMult: 1.0, extraStartItems: 0,
    trapSizeMult: 1.0,
  };
  for (const id of getUnlockedNodes()) {
    const node = UNLOCK_NODES[id];
    if (node?.apply) node.apply(stats);
  }
  return stats;
}

export function isUnlocked(id) {
  return getUnlockedNodes().includes(id);
}

/** 비용/선행 노드 검증 후 해금. 성공 시 true, 실패 시 false. */
export function purchaseNode(id) {
  const node = UNLOCK_NODES[id];
  if (!node) return false;
  const unlocked = getUnlockedNodes();
  if (unlocked.includes(id)) return false;
  if (node.prereq && !unlocked.includes(node.prereq)) return false;
  if (getMetaCores() < node.cost) return false;
  addMetaCores(-node.cost);
  unlocked.push(id);
  try { localStorage.setItem(UNLOCK_NODES_KEY, JSON.stringify(unlocked)); } catch {}
  return true;
}

/** 노드 상태 분류 — UI 색상 결정용. 'owned' | 'available' | 'locked' (선행 미해금) | 'unaffordable' */
export function nodeStatus(id) {
  const node = UNLOCK_NODES[id];
  if (!node) return 'locked';
  const unlocked = getUnlockedNodes();
  if (unlocked.includes(id)) return 'owned';
  if (node.prereq && !unlocked.includes(node.prereq)) return 'locked';
  return getMetaCores() >= node.cost ? 'available' : 'unaffordable';
}

// ── Player 효과 적용 ─────────────────────────────────

/** Player 생성 직후 호출 — 해금된 노드의 apply(player) 효과 일괄 적용. */
export function applyUnlocksToPlayer(player) {
  for (const id of getUnlockedNodes()) {
    const node = UNLOCK_NODES[id];
    if (node?.apply) node.apply(player);
  }
}

// ── 상점 발견 플래그 ─────────────────────────────────

export function getShopDiscovered() {
  try { return localStorage.getItem(SHOP_DISCOVERED_KEY) === 'true'; }
  catch { return false; }
}

/** 상점방을 처음 진입하는 순간 호출 — 이후 모든 런에서 Hub 에 NPC 가 등장한다. */
export function markShopDiscovered() {
  try { localStorage.setItem(SHOP_DISCOVERED_KEY, 'true'); } catch {}
}

// ── 전체 초기화 ──────────────────────────────────────

/** 메타 코어·해금 노드·상점 발견·패시브 획득 이력을 전부 삭제. Hub HUD 초기화 버튼에서 호출. */
export function resetAllProgress() {
  try {
    localStorage.removeItem(META_CORES_KEY);
    localStorage.removeItem(UNLOCK_NODES_KEY);
    localStorage.removeItem(SHOP_DISCOVERED_KEY);
    localStorage.removeItem(PASSIVE_ITEMS_KEY);
  } catch {}
}
