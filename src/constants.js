export const GAME_W = 390;
export const GAME_H = 844;
export const HUD_H  = 88;   // 상단 HUD 높이 — UIScene TOP_H 와 반드시 일치

// 구역/층 구조 — 총 4구역 × 10층 = 40층 (설계 목표). 선형 카운터 1~MAX_FLOOR.
//   구역 1: 층  1~10  풀숲 (base)
//   구역 2: 층 11~20  더 깊은 숲 = 구역 1 강화·혼합, 보라톤
//   구역 3: 층 21~30  사냥꾼 영역 = 동물 + 인간 사냥꾼 (base, 신규 로스터)
//   구역 4: 층 31~40  추격의 끝 = 구역 3 강화·혼합
// 화면엔 각 구역이 다시 1~10층으로 재표시(displayFloor).
export const MAX_ZONE  = 4;
export const MAX_FLOOR = MAX_ZONE * 10;   // 40

export const zoneOf       = (floor) => Math.ceil(floor / 10);    // 1..MAX_ZONE
export const displayFloor = (floor) => ((floor - 1) % 10) + 1;   // 1..10

// 강화 구역 = 짝수 구역(2·4). 홀수 구역(1·3)은 base 로스터, 다음 짝수 구역이 그것을 ×배수 강화·혼합한다.
//   구역 1↔2, 구역 3↔4 가 각각 base↔강화 쌍.
export const isStrengthenedZone = (floor) => zoneOf(floor) % 2 === 0;

// 상점 가격 구역 복리 배율 — 구역이 오를 때마다 곱연산으로 누적 (하드코딩 룩업 대신 공식으로 파생).
//   EnemyManager 의 ZONE34_CORE_MULT(강화 구역 코어 드롭 배율, 1.5)와는 별개 상수 — 서로 독립 튜닝.
// zonePriceMult(floor) = SHOP_ZONE_MULT ** (zoneOf(floor) - 1) → 구역 1 ×1 / 2 ×1.7 / 3 ×2.89 / 4 ×4.913
export const SHOP_ZONE_MULT = 1.7;
export const zonePriceMult = (floor) => SHOP_ZONE_MULT ** (zoneOf(floor) - 1);
