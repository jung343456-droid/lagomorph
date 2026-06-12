/**
 * 영구 해금 트리 — 공격 9(파동 확장 3 포함) / 생존 11(강인한 몸 5 포함) / 특수 14(잔해 회수 4·코어 흡수 3 포함) = 34노드.
 * 각 단계 N 노드는 단계 N-1 노드의 prereq 를 갖는다 (tier = 선행 깊이 = 표시 순서, 선행 해금 필수).
 * 특수 계열은 비용 오름차순 단일 사슬이며, 잔해 회수도 같은 사슬에 편입되어 있다.
 *
 * apply(player): Player 생성 직후 호출되어 시작 스탯/플래그에 반영.
 *
 * 비용/효과 정의는 design/LAGOMORPH_FULL_GDD.md PART 6 표를 따른다.
 * 카드 수가 화면을 넘기 때문에 UnlockMenu 는 그리드 영역을 스크롤뷰로 표시한다.
 */

export const BRANCHES       = ['attack', 'survival', 'special'];
export const BRANCH_LABELS  = { attack: '공격', survival: '생존', special: '특수' };

export const UNLOCK_NODES = {
  // ── 공격 계열 ──────────────────────────────────────
  claw_boost_1: {
    branch: 'attack', tier: 1, prereq: null, cost: 40,
    name: '발톱 강화 I', desc: '근거리 데미지 +5%',
    apply: (p) => { p.meleeDamageMult += 0.05; },
  },
  wave_expand_1: {
    branch: 'attack', tier: 2, prereq: 'claw_boost_1', cost: 60,
    name: '파동 확장 I', desc: '근거리 반경 +5% (×1.0 → ×1.05)',
    dynDesc: (p) => `근거리 반경 +5% (×${p.meleeRadiusMult.toFixed(2)} → ×${(p.meleeRadiusMult + 0.05).toFixed(2)})`,
    apply: (p) => { p.meleeRadiusMult += 0.05; },
  },
  charge_accel: {
    branch: 'attack', tier: 3, prereq: 'wave_expand_1', cost: 160,
    name: '충전 가속', desc: '근거리 충전 속도 +10%',
    apply: (p) => { p.chargeSpeedMult += 0.10; },
  },
  wave_expand_2: {
    branch: 'attack', tier: 4, prereq: 'charge_accel', cost: 220,
    name: '파동 확장 II', desc: '근거리 반경 +5% (→ ×1.10)',
    dynDesc: (p) => `근거리 반경 +5% (×${p.meleeRadiusMult.toFixed(2)} → ×${(p.meleeRadiusMult + 0.05).toFixed(2)})`,
    apply: (p) => { p.meleeRadiusMult += 0.05; },
  },
  rage_threshold: {
    branch: 'attack', tier: 5, prereq: 'wave_expand_2', cost: 300,
    name: '임계 분노', desc: '치명타율 +5% (기본 15 → 20%)',
    dynDesc: (p) => `치명타율 +5% (${Math.round(p.critRate * 100)} → ${Math.round((p.critRate + 0.05) * 100)}%)`,
    apply: (p) => { p.critRate += 0.05; },
  },
  razor_claws: {
    branch: 'attack', tier: 6, prereq: 'rage_threshold', cost: 500,
    name: '면도날 발톱', desc: '치명타 피해 +30% (×1.5 → ×1.8)',
    dynDesc: (p) => `치명타 피해 +30% (×${p.critMult.toFixed(1)} → ×${(p.critMult + 0.3).toFixed(1)})`,
    apply: (p) => { p.critMult += 0.3; },
  },
  wave_expand_3: {
    branch: 'attack', tier: 7, prereq: 'razor_claws', cost: 600,
    name: '파동 확장 III', desc: '근거리 반경 +5% (→ ×1.15)',
    dynDesc: (p) => `근거리 반경 +5% (×${p.meleeRadiusMult.toFixed(2)} → ×${(p.meleeRadiusMult + 0.05).toFixed(2)})`,
    apply: (p) => { p.meleeRadiusMult += 0.05; },
  },
  trap_master: {
    branch: 'attack', tier: 8, prereq: 'wave_expand_3', cost: 700,
    name: '덫꾼의 손', desc: '트랩 최대 동시 설치 5 → 6',
    apply: (p) => { p.trapMaxBonus = (p.trapMaxBonus ?? 0) + 1; },
  },
  starting_ember: {
    branch: 'attack', tier: 9, prereq: 'trap_master', cost: 900,
    name: '점화의 잔해', desc: '런 시작 시 코어 +10 보유',
    apply: (p) => { p.startingCores = (p.startingCores ?? 0) + 10; },
  },

  // ── 생존 계열 ── 비용 오름차순 단일 사슬. 강인한 몸 5단계를 중간중간 분산, 최후의 발버둥은 최종 티어.
  tough_body_1: {
    branch: 'survival', tier: 1, prereq: null, cost: 40,
    name: '강인한 몸 I', desc: '시작 HP +10 (100 → 110)',
    dynDesc: (p) => `시작 HP +10 (${p.maxHp} → ${p.maxHp + 10})`,
    apply: (p) => { p.maxHp += 10; p.hp += 10; },
  },
  thick_hide_1: {
    branch: 'survival', tier: 2, prereq: 'tough_body_1', cost: 80,
    name: '두꺼운 가죽 I', desc: '받는 피해 -5%',
    apply: (p) => { p.damageReduction = (p.damageReduction ?? 0) + 0.05; },
  },
  tough_body_2: {
    branch: 'survival', tier: 3, prereq: 'thick_hide_1', cost: 120,
    name: '강인한 몸 II', desc: '시작 HP +10 (→ 120)',
    dynDesc: (p) => `시작 HP +10 (${p.maxHp} → ${p.maxHp + 10})`,
    apply: (p) => { p.maxHp += 10; p.hp += 10; },
  },
  combat_adapt: {
    branch: 'survival', tier: 4, prereq: 'tough_body_2', cost: 160,
    name: '전투 적응', desc: '방 클리어 시 HP +2',
    apply: (p) => { p.hpPerRoomClear = (p.hpPerRoomClear ?? 0) + 2; },
  },
  tough_body_3: {
    branch: 'survival', tier: 5, prereq: 'combat_adapt', cost: 250,
    name: '강인한 몸 III', desc: '시작 HP +10 (→ 130)',
    dynDesc: (p) => `시작 HP +10 (${p.maxHp} → ${p.maxHp + 10})`,
    apply: (p) => { p.maxHp += 10; p.hp += 10; },
  },
  reinforced_hide: {
    branch: 'survival', tier: 6, prereq: 'tough_body_3', cost: 500,
    name: '강화 외피', desc: '시작 방어력 +1 (방탄조끼와 누적)',
    apply: (p) => { p.armor = (p.armor ?? 0) + 1; },
  },
  tough_body_4: {
    branch: 'survival', tier: 7, prereq: 'reinforced_hide', cost: 600,
    name: '강인한 몸 IV', desc: '시작 HP +10 (→ 140)',
    dynDesc: (p) => `시작 HP +10 (${p.maxHp} → ${p.maxHp + 10})`,
    apply: (p) => { p.maxHp += 10; p.hp += 10; },
  },
  second_wind: {
    branch: 'survival', tier: 8, prereq: 'tough_body_4', cost: 700,
    name: '거듭난 숨결', desc: '방 클리어 시 HP +2 추가 (총 +4)',
    apply: (p) => { p.hpPerRoomClear = (p.hpPerRoomClear ?? 0) + 2; },
  },
  tough_body_5: {
    branch: 'survival', tier: 9, prereq: 'second_wind', cost: 800,
    name: '강인한 몸 V', desc: '시작 HP +10 (→ 150)',
    dynDesc: (p) => `시작 HP +10 (${p.maxHp} → ${p.maxHp + 10})`,
    apply: (p) => { p.maxHp += 10; p.hp += 10; },
  },
  phantom_guard: {
    branch: 'survival', tier: 10, prereq: 'tough_body_5', cost: 900,
    name: '잔영의 가호', desc: '피격 후 무적 시간 +25%',
    apply: (p) => { p.invulnDurationMult = (p.invulnDurationMult ?? 1) * 1.25; },
  },
  last_struggle: {
    branch: 'survival', tier: 11, prereq: 'phantom_guard', cost: 1000,
    name: '최후의 발버둥', desc: '1회 사망 무효 (HP 30% 복원, 런당)',
    apply: (p) => { p.extraLives = (p.extraLives ?? 0) + 1; },
  },

  // ── 특수 계열 ── 비용 오름차순 단일 사슬 (tier = 선행 깊이 = 표시 순서). 잔해 회수도 같은 사슬에 편입.
  merchant_favor: {
    branch: 'special', tier: 1, prereq: null, cost: 50,
    name: '상인의 호의', desc: '상점 슬롯 +1 (3 → 4)',
    dynDesc: (p) => { const cur = 3 + (p.shopSlotBonus ?? 0); return `상점 슬롯 +1 (${cur} → ${cur + 1})`; },
    apply: (p) => { p.shopSlotBonus = (p.shopSlotBonus ?? 0) + 1; },
  },
  meta_salvage_1: {
    branch: 'special', tier: 2, prereq: 'merchant_favor', cost: 60,
    name: '잔해 회수 I', desc: '사망 시 메타 보존율 +5% (25 → 30%)',
    dynDesc: (p) => { const cur = Math.round((p.metaRetainRate ?? 0.25) * 100); return `사망 시 메타 보존율 +5% (${cur} → ${cur + 5}%)`; },
    apply: (p) => { p.metaRetainRate = (p.metaRetainRate ?? 0.25) + 0.05; },
  },
  core_collector: {
    branch: 'special', tier: 3, prereq: 'meta_salvage_1', cost: 90,
    name: '코어 수집기', desc: '드롭 코어량 ×1.15',
    apply: (p) => { p.coreDropMult = (p.coreDropMult ?? 1) * 1.15; },
  },
  meta_salvage_2: {
    branch: 'special', tier: 5, prereq: 'core_reach_1', cost: 150,
    name: '잔해 회수 II', desc: '사망 시 메타 보존율 +5% (→ 35%)',
    dynDesc: (p) => { const cur = Math.round((p.metaRetainRate ?? 0.25) * 100); return `사망 시 메타 보존율 +5% (${cur} → ${cur + 5}%)`; },
    apply: (p) => { p.metaRetainRate = (p.metaRetainRate ?? 0.25) + 0.05; },
  },
  memory_frag: {
    branch: 'special', tier: 6, prereq: 'meta_salvage_2', cost: 180,
    name: '기억 단편화', desc: '시작 방 아이템 +1',
    apply: (p) => { p.extraStartItems = (p.extraStartItems ?? 0) + 1; },
  },
  meta_salvage_3: {
    branch: 'special', tier: 8, prereq: 'core_reach_2', cost: 300,
    name: '잔해 회수 III', desc: '사망 시 메타 보존율 +5% (→ 40%)',
    dynDesc: (p) => { const cur = Math.round((p.metaRetainRate ?? 0.25) * 100); return `사망 시 메타 보존율 +5% (${cur} → ${cur + 5}%)`; },
    apply: (p) => { p.metaRetainRate = (p.metaRetainRate ?? 0.25) + 0.05; },
  },
  merchant_credit: {
    branch: 'special', tier: 9, prereq: 'meta_salvage_3', cost: 360,
    name: '상인의 신용', desc: '상점 가격 -10% (모든 슬롯)',
    apply: (p) => { p.shopPriceMult = (p.shopPriceMult ?? 1) * 0.9; },
  },
  merchant_pact: {
    branch: 'special', tier: 10, prereq: 'merchant_credit', cost: 500,
    name: '상인의 계약', desc: '상점 슬롯 +1 (3 → 4 → 5, merchant_favor 누적)',
    dynDesc: (p) => { const cur = 3 + (p.shopSlotBonus ?? 0); return `상점 슬롯 +1 (${cur} → ${cur + 1})`; },
    apply: (p) => { p.shopSlotBonus = (p.shopSlotBonus ?? 0) + 1; },
  },
  meta_salvage_4: {
    branch: 'special', tier: 11, prereq: 'merchant_pact', cost: 500,
    name: '잔해 회수 IV', desc: '사망 시 메타 보존율 +5% (→ 45%)',
    dynDesc: (p) => { const cur = Math.round((p.metaRetainRate ?? 0.25) * 100); return `사망 시 메타 보존율 +5% (${cur} → ${cur + 5}%)`; },
    apply: (p) => { p.metaRetainRate = (p.metaRetainRate ?? 0.25) + 0.05; },
  },
  bargain_2: {
    branch: 'special', tier: 13, prereq: 'core_reach_3', cost: 700,
    name: '흥정 II', desc: '상점 가격 추가 -5% (×0.9 → ×0.855)',
    apply: (p) => { p.shopPriceMult = (p.shopPriceMult ?? 1) * 0.95; },
  },
  golden_touch: {
    branch: 'special', tier: 14, prereq: 'bargain_2', cost: 900,
    name: '황금손', desc: '드롭 코어량 추가 ×1.10 (core_collector 누적)',
    apply: (p) => { p.coreDropMult = (p.coreDropMult ?? 1) * 1.10; },
  },
  core_reach_1: {
    branch: 'special', tier: 4, prereq: 'core_collector', cost: 120,
    name: '코어 흡수 I', desc: '코어 흡수 범위 +15 (55 → 70)',
    dynDesc: (p) => { const cur = p.corePickupRange ?? 55; return `코어 흡수 범위 +15 (${cur} → ${cur + 15})`; },
    apply: (p) => { p.corePickupRange = (p.corePickupRange ?? 55) + 15; },
  },
  core_reach_2: {
    branch: 'special', tier: 7, prereq: 'memory_frag', cost: 240,
    name: '코어 흡수 II', desc: '코어 흡수 범위 +15 (→ 85)',
    dynDesc: (p) => { const cur = p.corePickupRange ?? 55; return `코어 흡수 범위 +15 (${cur} → ${cur + 15})`; },
    apply: (p) => { p.corePickupRange = (p.corePickupRange ?? 55) + 15; },
  },
  core_reach_3: {
    branch: 'special', tier: 12, prereq: 'meta_salvage_4', cost: 600,
    name: '코어 흡수 III', desc: '코어 흡수 범위 +15 (→ 100)',
    dynDesc: (p) => { const cur = p.corePickupRange ?? 55; return `코어 흡수 범위 +15 (${cur} → ${cur + 15})`; },
    apply: (p) => { p.corePickupRange = (p.corePickupRange ?? 55) + 15; },
  },
};

/** branch 별로 tier 오름차순 정렬된 [id, node] 배열 반환 — UI 렌더 헬퍼 */
export function nodesByBranch(branch) {
  return Object.entries(UNLOCK_NODES)
    .filter(([_, n]) => n.branch === branch)
    .sort((a, b) => a[1].tier - b[1].tier);
}
