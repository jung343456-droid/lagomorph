# LAGOMORPH — 임시 저장 / 이어하기

진행 중인 런 한 판을 **정확한 순간 그대로** localStorage에 직렬화하고, 허브의 "이어하기"로 복원하는 기능. 모바일(390×844)/웹 모두에서 세션 중단 후 재개를 지원한다.

> 메타 진행(`MetaProgress` — 메타 코어·해금·플래그)과는 **별개**다. 메타는 런 간 영속, 임시 저장은 런 한 판의 스냅샷.

핵심 모듈: **`src/data/SaveManager.js`** (단일 슬롯 `localStorage['lagomorph_run_save']`, `VERSION` 가드).

---

## 저장 / 삭제 시점

| 트리거 | 위치 | 비고 |
|---|---|---|
| 10초 주기 | `GameScene._autosave` (`time.addEvent`) | 씬 일시정지 중에는 time 클럭이 멈춰 자동 스킵 |
| 방 이동 | `room-entered` 핸들러 → `delayedCall(0, _autosave)` | 방 구성 완료 후 다음 틱 |
| 수동 "저장 후 종료" | `UIScene._saveAndQuit` | 저장 후 허브 복귀 |
| 백그라운드 전환 | `visibilitychange`(hidden) / `pagehide` → `GameScene._saveOnBackground` | **모바일 필수** (아래 참조) |

**삭제**는 런이 실제로 끝날 때만, 모두 `GameScene._buildRunSummary` 진입 시 `clearRunSave()` 로 일원화:
- 사망 → `_showGameOver`
- ZONE CLEAR → `_showZoneClear`
- "포기" → `UIScene._abandonRun` 이 `GameScene.abandonRun()` 호출 → **사망과 동일한 결과 정산 화면**(`survived:false`, 보존율 정산). UIScene 가 직접 허브로 보내지 않는다.

> **정책(확정)**: 앱을 닫거나 "저장 후 종료"해도 저장본은 **유지**된다 — 같은 지점에서 이어하기 가능. 로그라이크 영속사망과 충돌할 수 있으나 의도된 동작이다. 신규 런을 시작하면 첫 자동저장이 기존 저장본을 덮어쓴다.

---

## 저장 스키마

`SaveManager.saveRunState(gameScene)` 가 조립하는 객체 (`JSON.stringify` → localStorage):

```
{
  version, savedAt,
  currentFloor,
  dungeon,            // roomManager.dungeonData 통째 (순수 데이터)
  currentRoomId,
  player,             // Player.serialize()
  enemyState,         // EnemyManager.serialize()
  attackState,        // AttackManager.serialize()
  stairs,             // { roomId, x, y, triggered } | null
  grimMet,
  floorPassiveItems,  // [{ id, x, y }] — 바닥에 놓인 PassiveItem
  meta: { runPicked }, // MetaProgress 런 픽업 카운터
}
```

컴포넌트별 직렬화/복원 메서드:

| 컴포넌트 | 직렬화 | 복원 | 보존 내용 |
|---|---|---|---|
| `Player` | `serialize()` | `applySave(data)` | 좌표·HP·전체 스탯·인벤토리·방향. 복원 시 저장값으로 **덮어씀**(런 중 아이템 변경분 반영) |
| `EnemyManager` | `serialize()` | `restoreFromSave(data)` | 적·코어·레어·상태이상·코어카운트·보스 |
| `AttackManager` | `serialize()` | `restoreFromSave(data)` | B쿨다운·설치 트랩(`_poops`) |
| `RoomManager` | — (dungeonData는 GameScene 레벨) | `restore(dungeon, roomId)` | 저장된 방으로 진입(적 스폰 안 함) |

---

## 설계 판단 (재현 시 주의)

### 1. 던전은 통째로 직렬화
`DungeonGenerator`는 비결정적(랜덤워크)이라 시드 재생성이 불가능하다. 대신 `dungeonData`가 이미 순수 데이터(방 배열에 `cleared/visited/doors/shopSlots/obstacleLayout`)라 그대로 JSON 가능.

### 2. 적 — 제네릭 스칼라 스냅샷
적 15종마다 `serialize()`를 쓰지 않고, 인스턴스의 평범한 프로퍼티만 추출한다 (`EnemyManager._snapshotEnemy`):
- 저장: `type`(역매핑) + `gameObject` 좌표/속도 + `this`의 number/string/boolean + 평면 `{x,y}`(예: `facingDir`)
- 제외: `SNAPSHOT_SKIP`(`scene/gameObject/_hpBg/_hpFill/_blinkEvent`) + 함수/Phaser 객체 → **순환참조 방지 필수**
- 복원(`_restoreEnemy`): `new Cls(scene, x, y)` → `Object.assign(enemy, props)` → 좌표/속도 적용 → 엘리트면 `_applyEliteTint`

타입 매핑은 `ALL_CLASSES`(일반 적 + 보스 `fang/wolf/blackbear/owlking`)와 역방향 `CLASS_TO_TYPE`. 적 클래스를 **추가하면 매핑에도 반영**해야 복원된다.

> **구역 3·4 강화(`_applyZoneBuff`, 층 11~20)는 별도 처리 불필요.** ×1.4/×1.1 변형 결과가 `maxHp·hp·damage·speedMult·baseSpeedMult·zoneBuffed`라는 number/boolean 인스턴스 프로퍼티에 그대로 남아 스냅샷에 보존되고, `Object.assign`으로 복원된다. 복원 경로에서 버프를 **재적용하지 않으므로 중복 강화 없음**. `currentFloor`는 1~20 범위로 저장된다.

### 3. 상태이상 Map은 인덱스로
`_poisoned/_burned/_frozen`은 `Map<enemy, entry>`라 인스턴스 키를 직렬화할 수 없다. **live 배열 인덱스**로 변환해 저장하고, 복원 시 같은 순서로 재구성한 `enemies[idx]`를 키로 Map을 재구축한다. → 적 직렬화/복원 순서가 동일해야 idx가 유효.

### 4. 복원 순서 제약 — 어기면 깨짐
`GameScene.create()` 복원 블록은 **이벤트 핸들러 등록 후 + `scene.launch('UIScene')` 전**에 위치하며, 순서가 고정이다:

```
1. roomManager.restore(dungeon, roomId)   // 적 스폰 안 함(_enterRoom의 skipSpawn), room-entered emit
2. player.applySave(save.player)          // 좌표/스탯/인벤토리 덮어쓰기
3. enemyManager.restoreFromSave(...)      // 적 주입
4. attackManager.restoreFromSave(...)     // 트랩 — 반드시 마지막
```

- **4가 마지막인 이유**: `AttackManager`의 `room-entered` 리스너가 `_poops`를 비운다. room 진입(1)이 그 이벤트를 발생시키므로, 트랩 복원은 그 뒤에 와야 안 지워진다.
- `_enterRoom(room, fromDir, { skipSpawn })`: 복원 시 적은 EnemyManager가 주입하므로 스폰을 건너뛰고 벽/장애물/카메라/문잠금만 구성.

### 5. 의도적 미저장
- **비행 중 적 투사체**(`_enemyProjs`): 클래스별 텍스처 재생성이 취약 → 제외(곧 벽에 소멸하는 단명 객체).
- **복원 시 `enemy.update(0, player)` 호출 안 함**: 보스 AI 부수효과(howl 소환 등)가 즉발될 수 있어서. HP바/스프라이트는 다음 `GameScene.update` 프레임(~16ms)에 자동 동기화.
- **플레이어 전이성 상태**(무적·넉백·슬로우 타이머)·**근거리 충전 게이지**: 복원 시 리셋.

### 6. 메타 픽업 정합성
`MetaProgress._runPicked`를 저장본 `meta.runPicked`에 포함해 복원한다(`beginMetaRun()` 후 `addRunPickup(saved)`). "저장 후 종료"는 `commitMetaRun()`을 호출하지 않는다(런 미종료). 실제 정산은 사망/클리어/포기 시 1회만.

---

## 모바일 (Capacitor / Android WebView)

- **localStorage**: 기존 `MetaProgress`와 동일 메커니즘 → Android WebView에서 동작 보장(DOM Storage 기본 활성). 쿼터 5~10MB, 페이로드 수십 KB로 여유. Capacitor가 WebView를 안정적 origin으로 서빙하므로 앱 재실행 간 유지.
- **백그라운드 저장이 필수인 이유**: 앱이 백그라운드로 가면 `requestAnimationFrame`이 멈춰 **Phaser 시계가 정지 → 주기 타이머가 안 돈다.** OS는 백그라운드 앱을 clean shutdown 없이 죽일 수 있다. → `visibilitychange`(hidden)/`pagehide` 시점에 동기 저장(`localStorage.setItem`은 동기라 freeze 전 flush 보장). 리스너는 `GameScene` `shutdown`에서 정리.

---

## UI

- **허브 "이어하기"** (`HubScene._buildContinueButton`): `hasRunSave()`일 때만 기상 기계 하단에 노출 → `scene.start('GameScene', { restore: true })`.
- **일시정지 메뉴** (`UIScene`): ESC 또는 좌상단 ⏸ 버튼 → 계속하기 / 저장 후 종료 / 포기. 기존 오버레이 패턴(`GameScene.scene.pause()`/`resume()`, `update()` 가드)을 재사용.
  - **포기**: `gs.scene.resume()`(결과 버튼 입력용) 후 `gs.abandonRun()` → 사망과 동일한 결과 화면. 결과 화면이 뜨면 `GameScene.update()`가 `_endScreenEls` 가드로 게임플레이를 정지(포기 후 잔여 적 접촉으로 결과창 중복 생성 방지).

---

## 관련 파일

```
src/data/SaveManager.js     신규 — 직렬화·localStorage I/O
src/entities/Player.js      serialize / applySave
src/systems/EnemyManager.js serialize / restoreFromSave / _snapshotEnemy / _restoreEnemy
src/systems/AttackManager.js serialize / restoreFromSave / _restorePoop
src/world/RoomManager.js    restore / _enterRoom(skipSpawn)
src/scenes/GameScene.js     create(data) 복원 분기 · _autosave · _saveOnBackground · abandonRun · 종료 시 clearRunSave · update() _endScreenEls 가드
src/scenes/UIScene.js       일시정지 메뉴 · _saveAndQuit · _abandonRun(→ GameScene.abandonRun)
src/scenes/HubScene.js      _buildContinueButton · _continueRun
```
