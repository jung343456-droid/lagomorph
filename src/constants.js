export const GAME_W = 390;
export const GAME_H = 844;
export const HUD_H  = 88;   // 상단 HUD 높이 — UIScene TOP_H 와 반드시 일치

// 층(1~20 선형 카운터) ↔ 구역/표시층 매핑.
//   구역 1: 층 1~10 (풀숲 1~5 + 깊은 숲 6~10)
//   구역 2: 층 11~20 (1·2구역 적 혼합·강화, 보라톤) — 화면엔 다시 1~10층으로 재표시
export const zoneOf       = (floor) => Math.ceil(floor / 10);    // 1..2
export const displayFloor = (floor) => ((floor - 1) % 10) + 1;   // 1..10
