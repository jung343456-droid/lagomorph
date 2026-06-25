/**
 * 기억 보관실(ENGRAM VAULT) 메타데이터 — 단일 출처.
 *
 * 각 보관실은 특정 층에 고정 등장한다(DungeonGenerator._addSecretRooms 가 VAULT_FLOOR_MAP 참조).
 * 허브의 '누군가의 기억'(비디오 테이프) 메뉴가 발견한 보관실을 이 표로 나열하고,
 * 선택 시 해당 floor 로 바로 진입한다(HubScene → GameScene { startFloor }).
 *
 * idx 는 vault-entered 이벤트의 vaultIdx, 발견 진행 저장 키(MetaProgress.getDiscoveredVaults)와 일치한다.
 * title 은 GameScene._showVaultText 의 VAULT_LINES 제목과 맞춘다.
 */
export const VAULT_META = [
  { idx: 0, floor: 6,  title: '「양지(陽地)」' },
  { idx: 1, floor: 16, title: '「열람(閱覽)」' },
  { idx: 2, floor: 26, title: '「원본(原本)」' },
  { idx: 3, floor: 36, title: '「잔향(殘響)」' },
];

/** floorNum → vaultIdx (DungeonGenerator 고정 층 판정용). VAULT_META 에서 파생. */
export const VAULT_FLOOR_MAP = Object.fromEntries(VAULT_META.map(v => [v.floor, v.idx]));

/** vaultIdx → 메타. 없으면 undefined. */
export function vaultMeta(idx) {
  return VAULT_META.find(v => v.idx === idx);
}
