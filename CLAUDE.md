# LAGOMORPH — Claude Code 개발 컨텍스트

## 프로젝트 개요

Phaser 3.60 탑다운 로그라이크. 모바일(390×844 portrait) 우선, Capacitor 패키징.
플레이어는 강화 토끼 VOSS-7(코드명 soma). 설계 문서: `design/LAGOMORPH_FULL_GDD.md`

개발 서버: `npm run dev` → `http://localhost:5173`
모바일 패키징(Capacitor): `MOBILE.md` 참조 — 웹은 `base=/lagomorph/`, 모바일은 `--mode mobile`(`base=./`)로 빌드 분기. `android/`는 git 추적 대상(네이티브 커스터마이징 보존 — 전체화면 `MainActivity` 등). 빌드 산출물은 `android/.gitignore`가 제외한다.

---

## 기술 스택

- **엔진**: Phaser 3.60 / **번들러**: Vite 5 / **물리**: Arcade Physics (gravity: 0)
- **언어**: JavaScript ES modules / **캔버스**: 390×844, `Scale.FIT`, `activePointers: 3`

---

## 씬 구조

`BootScene → GameScene (병렬) UIScene` — 씬 간 통신은 이벤트 버스 (`scene.events.emit/on`)

**GameScene 생성 순서 (순서 중요):**
EnemyManager 먼저, AttackManager 나중 — AttackManager가 `enemyManager.enemyGroup`을 참조함

---

## 소스 파일 맵

```
src/
├── scenes/
│   ├── BootScene.js        에셋 로드 + player_tex 생성 (타일은 PNG 외부 에셋)
│   ├── GameScene.js        메인 게임 루프
│   └── UIScene.js          HUD (HP바, 충전게이지, 미니맵, 스킬슬롯)
├── entities/
│   ├── Player.js           이동, HP, 8방향 걷기 애니메이션, 패시브 아이템 스탯
│   ├── Fox.js              추격형 (idle/chase/flee/stun)
│   ├── Rat.js              돌진형 군집 (idle/rush/cooldown/stun), 3마리 묶음 스폰
│   ├── Weasel.js           기습형 (idle/approach/dash/cooldown/stun)
│   ├── Hedgehog.js         방어형 (idle/chase/spike/stun), 가시 AoE·무적
│   ├── Squirrel.js         원거리형 (idle/kite/stun), 도토리 투사체
│   ├── Wolf.js             중간 보스 (idle/chase/strafe/lunge/howl/stun), 측면 우회·도약·오라·소환 ※"엘리트 적"과 무관 — 아래 정예 변이 참조
│   ├── Fang.js             최종 보스 3층 (idle/chase/dash/combo/stun)
│   ├── Core.js             드롭 아이템, 수집 시 coreCount++
│   ├── RareItem.js         보스 드롭 회복 아이템
│   ├── PassiveItem.js      패시브 아이템 (ITEM_DEFS 13개), localStorage 해금
│   ├── Shopkeeper.js       상점 NPC (근접 시 shop-open-requested)
│   └── Altar.js            코어 제단 NPC (출구방, 근접 시 altar-open-requested → 런 한정 강화)
├── systems/
│   ├── AttackManager.js    A(근거리 AoE)/B(설치형 트랩) 공격, 충전 게이지
│   └── EnemyManager.js     적 스폰/정리 (가중치 테이블), 히트판정, 투사체 수동 이동
├── utils/
│   └── InputManager.js     가상 조이스틱 + WASD 폴백
└── world/
    ├── DungeonGenerator.js 8×6 격자 랜덤 워크
    ├── Room.js             방 렌더링 + 물리 벽(tileSprite)/장애물(tileSprite)/문 잠금
    └── RoomManager.js      방 전환, 카메라, 문 트리거

public/assets/
├── tiles/                  타일 PNG (scripts/gen-tiles.js 로 재생성)
│   ├── tile_floor.png      40×40 기본 석재 (가중치 45%)
│   ├── tile_floor_b.png    40×40 밝은 변형 (40%)
│   ├── tile_crack.png      40×40 균열 (10%)
│   ├── tile_moss.png       40×40 이끼 (5%)
│   ├── tile_wall.png       20×20 벽돌 (벽 tileSprite 텍스처)
│   └── tile_obstacle.png   24×24 boulder (장애물 tileSprite 텍스처)
├── characters/             motion/soma-walk-sprite-sheet3.png (걷기 8방향×4프레임, 셀 128×128, BootScene load.spritesheet)
└── enemies/                {name}/{name}-{dir|action}.png
```

---

## 핵심 아키텍처

### 물리 오브젝트
**`add.circle`(Arc) 사용 금지 — physics body 위치 동기화 불가.**

- 플레이어/트랩/문 잠금 블록: `add.rectangle` + `physics.add.existing`
- 벽·장애물: `add.tileSprite` + `physics.add.existing` (텍스처 타일링 목적)
- Arc 대신 rectangle이나 tileSprite를 사용한다.

Player는 `add.image` + `physics.add.existing`. 텍스처 교체 후 `setDisplaySize` 재호출 필요 (스케일 초기화됨).

설치형 트랩(poop)은 dynamic + immovable body. static body 사용 시 `_poopGroup.add()` 에서 `body[key] is not a function` 오류 발생.

### 적 투사체
`physics.add.group().add()` 사용 불가 — Phaser가 `add()` 시 body 기본값을 덮어써 velocity가 초기화됨.
physics body 없이 `_enemyProjs` 배열에 등록, `EnemyManager.update()`에서 `go.x += vx * dt` 수동 이동.

### 적 공통 인터페이스
모든 적은 `hp`, `maxHp`, `damage`, `alive`, `destroyed`, `attackCooldown`, `coreDrops`, `gameObject`, `x`/`y` getter, `update(delta, player)`, `takeDamage(amount, knockback) → bool`, `dispose()` 를 구현한다.

---

## 공격 시스템

| 버튼 | 종류 | 수치 |
|---|---|---|
| A / Z | 근거리 원형 AoE (충전) | 반경 60/72/90px × `meleeRadiusMult`, 피해 10/12/14 × `meleeDamageMult`, 충전속도 × `chargeSpeedMult` |
| B / X | 설치형 트랩 | 코어 소모 `max(1, 3-trapCostBonus)`, 쿨다운 0.3s, 피해 30, 크기 22px × `trapSizeMult`, 최대 5개 |

히트판정:
- **근거리**: `attack-fired` 이벤트 → EnemyManager가 `Phaser.Math.Distance` 원형 판정
- **설치형**: `physics.add.overlap(_poopGroup, enemyGroup)` → AttackManager 처리
- **적 투사체**: EnemyManager `_enemyProjs` 수동 이동, 플레이어와 22px 이내 시 피격

---

## 적 스폰 테이블 (층별)

`EnemyManager.FLOOR_SPAWN_TABLES` — 층 진입 시 `setFloor(n)`이 풀을 전환한다. rat·bat은 선택 시 3마리 묶음 스폰.

- **구역 1 전반 (1~5층)**: rat·weasel·fox·squirrel·hedgehog 가 층마다 점진 추가
- **구역 1 후반 (6~10층)**: bat·boar·spider·toad·bear
- **구역 2 (11~20층)**: `MIXED_POOL` — 구역 1 적 10종 혼합 풀(모든 층 공용). 스폰 시
  `_applyZoneBuff()`로 **HP·공격력 ×1.4, 이동속도 ×1.1, 코어 드롭 ×1.5** 강화(`ZONE34_*` 상수 — 네이밍은
  구버전 4구역 잔재, 실제 조건은 `floorNum >= 11`). 속도 버프는 공용 `speedMult`/`baseSpeedMult` 경유 —
  Wolf 오라는 `baseSpeedMult` 기준으로 곱한다.

### 엘리트 적 (정예 변이) — Wolf 중간 보스와 다른 개념

> **용어 주의**: 사용자가 말하는 **"엘리트 적"**은 Wolf(중간 보스)가 아니라, **일반 적이 1% 확률로
> 변이하는 강화 개체**를 가리킨다. `EnemyManager._makeElite()` 참조.

`spawnForRoom` 에서 방 스폰 직후 각 적이 `ELITE_CHANCE = 0.01` 확률로 정예 변이 — **방당 최대 1마리**.

- 능력치: **최대 HP ×4** (`ELITE_HP_MULT`), **공격력 ×2** (`ELITE_DMG_MULT`), **이동속도 ×1.8** (`ELITE_SPD_MULT`),
  코어 드롭 ×5(최소 8), `isElite = true`.
- 이동속도 ×1.8은 `baseSpeedMult`/`speedMult` 체인에 실어 적용 — 모든 적 이동이 `* speedMult` 를 곱하므로
  일관 적용된다(zone2 ×1.1·Wolf 오라 ×1.2 와 자연 합산). Weasel 대시·Boar 차지는 고정 속도라 제외.
- 시각: 붉은 틴트 `0xff8888` (`_applyEliteTint` — `setTint`·`clearTint` 를 오버라이드해 피격 점멸·자기
  베이스 틴트 재적용 후에도 붉은 틴트 강제. Bat/Bear/Boar/Spider/Toad 처럼 매 프레임 `setTint(TINT)` 로
  자기 색을 덧칠하는 적이 일반 개체처럼 보이던 버그 방지).
- 처치 시 `elite-killed` 이벤트 + `dropEliteItem`. 저장/복원은 `isElite`·변형 스탯이 스냅샷 대상이라 유지.

| 타입 | 1층 | 2층 | 3층 | 4층 | 5층 |
|---|---|---|---|---|---|
| rat      | 3 | 3 | 2 | 2 | 1 |
| weasel   | 2 | 2 | 2 | 2 | 2 |
| fox      | – | 2 | 2 | 2 | 2 |
| squirrel | – | – | 2 | 2 | 2 |
| hedgehog | – | – | – | 1 | 2 |

---

## 층 / 구역 구조

- **총 20층 / 2구역**. `GameScene.currentFloor`는 1~20 선형 카운터. 구역·표시층은 `constants.js`의
  공용 헬퍼로 파생: `zoneOf(f)=ceil(f/10)` (1~2), `displayFloor(f)=((f-1)%10)+1` (1~10).
  → **구역 1 = 1~10층, 구역 2 = 11~20층**(화면엔 각각 1~10층으로 표시).
- 각 층은 `DungeonGenerator`로 독립 생성된 8×6 격자 던전. 일반 전투방 + 가장 먼 방(`type='boss'`) 1개.
- 일반 전투방 적 수: `RoomManager._normalRoomCount` (1~20층 `baseByFloor`).
- 출구방(`type='boss'`) 내용물 (`RoomManager._enterRoom`):
  - **보스** 층 5·15: FANG / 층 10·20: OWL KING (`spawnBoss`) — 11층 이상은 강화 적용
  - **중간 보스** 층 3·13: Wolf 2마리 / 층 8·18: BlackBear (`spawnMidBoss`) — 11층 이상은 강화 적용
  - 그 외 출구방: 보스 없음 — 일반 적 +2 (`spawnForRoom`)
- 출구방 클리어 → `boss-cleared` 이벤트 → 800ms 후 ▼ 계단 등장 → 계단 진입 시 `_advanceFloor()` (`floor < 20`)
  - **패시브 아이템 드롭은 보스(5·10·15·20)·중간보스(3·8·13·18) 층에서만** — 보스 없는 일반 출구방 클리어는 미드롭 (`GameScene` boss-cleared 핸들러 `floor % 5` 판정)
- 구역 경계(10층) 클리어 → "ZONE 2 진입" 안내 + 계단 / **20층 클리어 → ZONE 2 CLEAR (런 종료)**
- 중간보스(3·8·13·18층) 처치 시 RareItem(30 회복)을 PassiveItem과 함께 드롭
- 상점방: 2·4 / 7·9 / 12·14 / 17·19층 (`DungeonGenerator`). 상점 가격은 구역 2(11~20층)에서 `×1.5`
  스케일 — 코어 드롭 ×1.5 인플레와 대칭(`GameScene.floorPriceMult`, 해금 할인과 곱연산).
- **코어 제단**: 비밀방(보물방)의 제단 분기로 등장(`Altar`). 비밀방은 보물방/제단방/엘리트방 각 1/3이라
  매 층 보장되지 않고 확률적으로만 만난다. 제단방 진입 시 `GameScene` room-entered 핸들러가 방 중앙에
  스폰, 방을 떠나면 정리. 코어를 런 한정 강화로 교환하는 후반 잉여 소모처 — 가격 누진(`ALTAR_BASE 20 ×
  1.5^n`, `n=EnemyManager._altarPurchases`), sold 없이 반복 구매. 상점 오버레이 재사용
  (`UIScene.openAltar`/`_shopMode`). **메타 적립(픽업 기준)과 무관**해 소모해도 해금 속도 불변. 상세는
  `design/SHOP.md` 코어 제단 절 / `design/LAGOMORPH_SECRET_ROOMS.md` §3. 강화 풀: `src/data/AltarPool.js`.
- 배경 타일: 구역 2(11~20층)는 보라톤. `BootScene._generatePurpleTiles()`가 grass/장애물 텍스처를 canvas
  `hue-rotate`로 변형해 `{key}_p` 텍스처를 생성하고, `Room._tex()`가 11층 이상 방에서 이를 선택 — 새 에셋 파일 없음.
  (setTint 곱연산은 초록 채널이 남아 칙칙·어두워 사용하지 않음)
- `RoomManager.floorNum` ↔ `EnemyManager.floorNum` 은 `RoomManager.setFloor()`에서 동기 갱신

---

## 방 시스템

**Room.js 주요 상수**: `ROOM_W=390`, `ROOM_H=756`(GAME_H − HUD_H), `WALL_T=20`, `DOOR_W=80`, `DOOR_HX=155`, `DOOR_VY=338`

문 전환: 플레이어가 방 가장자리 20px 이내 + 문 통로 범위 진입 시 페이드 전환.

---

## 플레이어 / HUD

- 스프라이트: `public/assets/characters/motion/soma-walk-sprite-sheet3.png` (걷기 8방향×4프레임, 셀 128×128, 행=방향 반시계 S·SW·W·NW·N·NE·E·SE, 열=프레임). BootScene `load.spritesheet('soma-walk', …)` 로 로드, Player 가 `DIR_ROW[dir]*4 + frame` 인덱스로 `setFrame` (이동 중에만 8fps 순환, 정지 시 0번)
- 표시: `PLAYER_SCALE=0.45` 공통 스케일(셀 128px → 표시 높이 ~45px) / Hitbox: `BODY_W=40, BODY_H=38`
- B슬롯 좌표: `center=(276, scale.height-130)` — AttackManager `_inBSlot()` 과 일치해야 함

---

## 개발 규칙

1. `add.circle`(Arc) 사용 금지. 플레이어·트랩은 `add.rectangle`, 벽·장애물은 `add.tileSprite` 사용
2. 상수값(속도, 피해량, 크기)은 파일 상단 `const` 로 분리
3. 적/방 정리 시 반드시 `dispose()` 호출 (HP바 메모리 누수 방지)
4. EnemyManager는 AttackManager보다 먼저 생성 (enemyGroup 참조 의존)
5. 적 투사체는 physics body 없이 수동 이동 — `physics.add.group().add()` 는 body를 덮어씀
6. **`src/entities/` 캐릭터 파일 작업 시 반드시 파일 상단 주석을 함께 갱신** — HP·속도·데미지·쿨다운 등 수치, AI 상태 전환 조건, 특수 동작이 변경되면 주석도 즉시 반영한다.
7. **아이템 추가·수정 시 반드시 `design/ITEMS.md` 를 갱신** — `ITEM_DEFS` 항목, Player 스탯 프로퍼티, 효과 적용 위치가 변경되면 즉시 반영한다.
8. **`npm run dev` (개발 서버) 는 사용자가 명시적으로 요청한 경우에만 실행한다.** 컴파일/문법 검증 목적이라도 자동 기동 금지 — 사용자가 직접 돌리고 있을 가능성이 높고, 백그라운드 프로세스가 누적되면 정리 부담이 커진다.
9. **`dead/` 폴더는 미사용 이미지 보관함이다. 참조·사용 금지.** 명시적인 지시가 있을 때만 참조한다.
10. **임시 저장/이어하기 관련 처리 변경 시 반드시 `design/SAVE_SYSTEM.md` 를 갱신** — `SaveManager` 스키마, 컴포넌트별 serialize/restore, 복원 순서 제약, 저장/삭제 시점, 모바일 처리가 변경되면 즉시 반영한다.
