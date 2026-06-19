/**
 * 임시 저장 (런 일시중단/이어하기) — 진행 중인 런 한 판을 통째로 localStorage 에 직렬화한다.
 *
 * MetaProgress(메타 코어·해금)와는 별개의 키(lagomorph_run_save)를 쓰는 "단일 슬롯".
 * 정확한 순간 저장: 살아있는 적(HP·상태·위치), 상태이상(독·화상·빙결), 설치 트랩, 코어 카운트,
 * 플레이어 스탯/인벤토리, 바닥 아이템, 계단/보스 상태, 런 픽업 카운터까지 보존한다.
 *
 * 저장 시점: 30초 주기 자동저장 · 방 이동 시 자동저장 · 일시정지 메뉴의 "저장 후 종료".
 * 삭제 시점: 런 종료(사망 / ZONE CLEAR / 포기). 그 외에는 항상 덮어쓰기로 유지된다.
 *
 * 던전 레이아웃은 비결정적(DungeonGenerator 랜덤워크)이라 시드 재생성이 불가능 →
 * dungeonData(순수 데이터)를 통째로 직렬화한다.
 */

import { getRunPicked } from './MetaProgress';

const KEY     = 'lagomorph_run_save';
const VERSION = 1; // 스키마 변경 시 +1 → 구버전 저장본은 무효(이어하기 미노출)

/** 유효한(버전 일치) 저장본이 존재하는가. */
export function hasRunSave() {
  return loadRunSave() !== null;
}

/** 파싱된 저장본 객체 반환. 없거나 손상/버전 불일치 시 null. */
export function loadRunSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

/** GameScene 의 현재 상태를 수집해 localStorage 에 직렬화한다. */
export function saveRunState(gameScene) {
  const gs = gameScene;
  if (!gs || !gs.roomManager || !gs.player) return;
  const rm = gs.roomManager;

  const data = {
    version: VERSION,
    savedAt: Date.now(),
    currentFloor:  gs.currentFloor,
    dungeon:       rm.dungeonData,
    currentRoomId: rm.currentRoomData?.id ?? rm.dungeonData?.startId ?? 0,
    player:        gs.player.serialize(),
    enemyState:    gs.enemyManager.serialize(),
    attackState:   gs.attackManager.serialize(),
    stairs: gs._stairsRoomId !== null && gs._stairsPos
      ? { roomId: gs._stairsRoomId, x: gs._stairsPos.x, y: gs._stairsPos.y, triggered: !!gs._stairsTriggered }
      : null,
    roomDrops: rm.serializeRoomDrops(),
    floorPassiveItems: (gs._passiveItems ?? [])
      .filter(i => i.alive)
      .map(i => ({ id: i.id, x: i.x, y: i.y, roomId: i.roomId ?? null })),
    meta: { runPicked: getRunPicked() },
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // 저장 실패(용량 초과 등)는 게임 진행을 막지 않는다.
    console.warn('[SaveManager] saveRunState failed:', e);
  }
}

/** 저장본 삭제 — 런 종료 시 호출. */
export function clearRunSave() {
  try { localStorage.removeItem(KEY); } catch {}
}
