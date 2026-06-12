/**
 * 코어 제단 (Core Altar) — 런 한정 강화 풀.
 *
 * 후반 잉여 코어 소모처. 매 층 출구방(보스/계단 방)을 클리어하면 계단과 함께 제단이 등장하며,
 * 코어를 "이번 런 한정" 스탯 강화로 교환한다. (상점=회복/패시브, 제단=런 스탯 파워 — 역할 분리)
 *
 * 가격 누진(escalating cost): 제단에서 무엇이든 구매할 때마다 다음 구매 가격이 오른다.
 *   cost(n) = round(ALTAR_BASE × ALTAR_GROWTH^n),  n = 런 누적 구매 수
 *   → 잉여 코어를 흡수하되 한계효용이 자연 감소. 한 번 사면 모든 슬롯 가격이 같이 오른다.
 *   누진 카운터 n 은 EnemyManager._altarPurchases 가 보관(런 단위, serialize 저장 대상).
 *
 * 효과는 Player 기존 스탯 필드를 그대로 사용 → Player.serialize() 가 maxHp·meleeDamageMult·
 * chargeSpeedMult·trapMaxBonus·meleeRadiusMult 를 이미 저장하므로 런 한정 강화가 자동 보존된다.
 * UI 는 상점 오버레이를 재사용(UIScene.openAltar / 슬롯 kind:'upgrade').
 *
 * ※ 메타 적립(MetaProgress._runPicked)은 픽업 기준이라 제단 소모와 무관 — 소모해도 메타 속도 불변.
 */

export const ALTAR_BASE   = 20;   // 첫 구매(n=0) 가격
export const ALTAR_GROWTH = 1.5;  // 구매마다 ×1.5 누진

/** 런 누적 구매 수 n 에 대한 현재 제단 가격. */
export function altarCostFor(purchases) {
  return Math.round(ALTAR_BASE * Math.pow(ALTAR_GROWTH, Math.max(0, purchases)));
}

// 제단 강화 정의 — id 로 슬롯 추첨, apply(player) 로 효과 적용(런 한정, 중복 구매로 누적 가능).
export const ALTAR_POOL = {
  altar_hp: {
    name: '강철 심장', desc: '최대 HP +20 (+20 회복)',
    apply: (p) => { p.maxHp += 20; p.heal(20); },
  },
  altar_melee: {
    name: '예리한 발톱', desc: '근접 피해 +10%',
    apply: (p) => { p.meleeDamageMult += 0.10; },
  },
  altar_charge: {
    name: '신속 충전', desc: '충전 속도 +10%',
    apply: (p) => { p.chargeSpeedMult += 0.10; },
  },
  altar_trap: {
    name: '덫 증설', desc: '설치 덫 최대 +1',
    apply: (p) => { p.trapMaxBonus += 1; },
  },
  altar_radius: {
    name: '확장 파동', desc: '근접 범위 +8%',
    apply: (p) => { p.meleeRadiusMult += 0.08; },
  },
};
