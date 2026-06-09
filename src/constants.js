export const GAME_W = 390;
export const GAME_H = 844;
export const HUD_H  = 88;   // 상단 HUD 높이 — UIScene TOP_H 와 반드시 일치

// 층(1~20 선형 카운터) ↔ 구역/표시층 매핑.
//   구역 1: 층 1~5(풀숲) / 구역 2: 6~10(깊은 숲)
//   구역 3: 11~15 / 구역 4: 16~20 — 1·2구역 적 혼합·강화, 보라톤. 화면엔 1~5/6~10 으로 재표시.
export const zoneOf       = (floor) => Math.ceil(floor / 5);     // 1..4
export const displayFloor = (floor) => ((floor - 1) % 10) + 1;   // 1..10
