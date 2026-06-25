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
│   ├── DaggerHunter.js      구역3 근접 연타 (idle/chase/windup/slash/recover/stun), 인간 사냥꾼
│   ├── BowHunter.js         구역3 원거리 조준 + 올가미 덫(범위 안 근거리 공격 5회로 끊기) (idle/kite/aim/stun)
│   ├── Snake.js             구역3 잠복 기습 + 독 (lurk/windup/strike/retreat/stun), Player.applyPoison
│   ├── Crow.js              구역3 공중 표식 지원 (circle/mark/dive/stun), 사냥꾼 speedMult ×1.15 (Wolf 오라 응용)
│   ├── Badger.js            구역3 잠행 돌격 탱커 (chase/windup/claw/burrow/emerge/stun), burrow 무적
│   ├── Hound.js             구역3 표시5층 보스 "사냥개 무리" 구성원 2마리(+정예 활사냥꾼 2) (chase/windup/lunge/cooldown/stun)
│   ├── HunterBoss.js        구역3·4 표시10층 보스 "수석 사냥꾼" 다페이즈 (조준+올가미/단검콤보+소환/광역화살+분노)
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

- **총 40층 / 4구역** (`MAX_FLOOR=40`, `MAX_ZONE=4` — `constants.js`). `GameScene.currentFloor`는 1~40 선형
  카운터. 구역·표시층은 공용 헬퍼로 파생: `zoneOf(f)=ceil(f/10)` (1~4), `displayFloor(f)=((f-1)%10)+1` (1~10).
  → **구역 1 = 1~10, 구역 2 = 11~20, 구역 3 = 21~30, 구역 4 = 31~40**(화면엔 각각 1~10층 표시).
  - 구역 1 풀숲(base) / 구역 2 더 깊은 숲 / 구역 3 사냥꾼 영역(인간 사냥꾼+동물, 신규 로스터) / 구역 4 추격의 끝.
  - **강화 구역 = 짝수 구역(2·4)**: `isStrengthenedZone(f)=zoneOf(f)%2===0`. 구역2=구역1 강화, 구역4=구역3 강화.
    `EnemyManager` 강화 게이트(`_applyZoneBuff`)·`Room` 배경 보라톤(`_purple`)이 모두 이 헬퍼 사용.
  - 보스/중간보스 분기는 **`displayFloor` 기준**(표시 5·10층=보스, 3·8층=중간보스) — `RoomManager._enterRoom`,
    `EnemyManager.spawnBoss/spawnMidBoss`. 구역3·4 표시5층=사냥개 무리(Hound×2+정예 활사냥꾼×2), 표시10층=HunterBoss.
  - **서사 연출**: 30층(구역3 보스) "공허함" 배너, 40층(구역4 보스) "사냥꾼=로봇" 자각 후 런 종료 (`GameScene`).
- 각 층은 `DungeonGenerator`로 독립 생성된 8×6 격자 던전. 일반 전투방 + 가장 먼 방(`type='boss'`) 1개.
- 일반 전투방 적 수: `RoomManager._normalRoomCount` (표시층 1~10 기준 `byDisplay`, 전 구역 공용).
- 출구방(`type='boss'`) 내용물 (`RoomManager._enterRoom`, **표시층 기준 분기**):
  - **보스**(표시 5·10층) `spawnBoss`: 구역1·2 = FANG(5)/OWL KING(10) / 구역3·4 = 사냥개 무리 Hound×2+정예 활사냥꾼×2(5)/HunterBoss(10)
    - 사냥개 무리의 정예 활사냥꾼은 `_noEliteDrop` 로 개별 elite-killed 드롭을 억제 — 방 클리어 시 패시브 아이템 1개만 드롭
  - **중간 보스**(표시 3·8층) `spawnMidBoss`: 구역1·2 = Wolf×2(3)/BlackBear(8) / 구역3·4 = Hound×2(3)/정예 사냥꾼 듀오(8)
  - 짝수 구역(2·4)은 `isStrengthenedZone` 배수로 강화 적용
  - 그 외 출구방: 보스 없음 — 일반 적 +2 (`spawnForRoom`)
- 출구방 클리어 → `boss-cleared` 이벤트 → 800ms 후 ▼ 계단 등장 → 계단 진입 시 `_advanceFloor()` (`floor < MAX_FLOOR`)
  - **패시브 아이템 드롭은 표시 5·10층(보스)·3·8층(중간보스)에서만** (`GameScene` boss-cleared 핸들러 `displayFloor` 판정)
- 구역 경계(표시 10층, 비최종) 클리어 → "ZONE n 진입" 안내 + 계단 / **40층(구역4 보스) 클리어 → 로봇 자각 연출 → ZONE 4 CLEAR (런 종료)**
- 중간보스(표시 3·8층) 처치 시 RareItem(30 회복)을 PassiveItem과 함께 드롭
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
- A/B슬롯 좌표: **개별 자유 배치 가능**. 위치의 단일 출처는 `Settings.getSlotPos('A'|'B')` — 커스텀 위치가
  있으면 그것을, 없으면 조이스틱 **반대쪽** 기본 미러(조이스틱 좌측이면 우측 A=342·B=276 / 우측이면 좌측
  A=48·B=114, y=`GAME_H-130`). `AttackManager._inASlot/_inBSlot`(판정)·`UIScene._layoutSkillSlots()`(시각)가
  모두 `getSlotPos` 를 읽으므로 한 곳만 보면 된다. 셋이 어긋날 여지 없음.
- A/B슬롯 크기: **개별 조절 가능**(원형, 반지름). 단일 출처는 `Settings.getSlotRadius('A'|'B')` — 커스텀
  크기가 있으면 그것을, 없으면 `SLOT_R_DEFAULT=28`(범위 `SLOT_R_MIN=20`~`SLOT_R_MAX=46`). 시각
  (`_buildSkillSlots`/`_layoutSkillSlots`, 글자는 `SLOT_FONT_RATIO`로 비례)·공격 판정
  (`AttackManager._inASlot/_inBSlot`)·이동 양보 판정(`Settings.isInActionSlot`)이 모두 이 값을 읽는다.
  레이아웃 편집 화면(`_enterLayoutEdit`)의 "A 크기/B 크기" 슬라이더로 조절 → 확인 시 `setSlotSize` 저장.

---

## 설정 / 오디오 (`src/data/Settings.js`)

- 사용자 환경 설정 영속 모듈(메타 progression `MetaProgress.js` 와 분리). localStorage 키 `lagomorph_settings`
  = `{ bgmVolume, sfxVolume, bgmMuted, sfxMuted, joystickX, joystickY, aX, aY, bX, bY, aSize, bSize }`. 위치·크기는
  캔버스(390×844) 좌표, null 이면 기본값(위치: 조이스틱=좌하단·A/B=반대쪽 미러 / 크기: 반지름 `SLOT_R_DEFAULT`).
- **오디오 적용 글루도 이 모듈에 둔다**: `attachSound(this.sound)`(BootScene.create 에서 1회) 로 전역 sound
  manager 를 받고, `playSfx`/`playBgm`/`stopBgm` 이 BGM/SFX 볼륨·음소거를 반영해 재생한다. **현재 음원
  에셋은 없다** — cache 에 키가 없으면 조용히 무시하므로 호출해도 안전, 추후 음원만 추가하면 동작.
- 설정 UI 는 일시정지 메뉴(`UIScene._buildPauseOverlay`)의 '설정' → `_buildSettingsOverlay`:
  배경음/효과음 볼륨 슬라이더+음소거 토글, **컨트롤 배치 변경**(`_enterLayoutEdit`)·배치 초기화(`resetLayout`).
- 배치 편집(`_enterLayoutEdit`)은 실제 컨트롤을 숨기고 조이스틱·A·B **프록시 3개를 각각 자유 드래그**
  (`_pickLayoutTarget`/`_moveLayoutProxy`). 확인 시 세 위치 저장 + `setBasePosition`/`_layoutSkillSlots` 반영,
  취소 시 실제 컨트롤 미변경 복원.
- 조이스틱 활성화 영역은 `_jx` 기준 절반(좌↔우 자동 전환). A/B 버튼이 조이스틱 쪽에 놓여도
  `InputManager._onDown` 이 `Settings.isInActionSlot()` 로 버튼 탭을 공격에 양보해 이동과 충돌하지 않는다.

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
