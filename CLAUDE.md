# LAGOMORPH — Claude Code 개발 컨텍스트

## 프로젝트 개요

Phaser 3.60 탑다운 로그라이크. 모바일(390×844 portrait) 우선, Capacitor 패키징 예정.
플레이어는 강화 토끼 VOSS-7(코드명 soma). 설계 문서: `design/LAGOMORPH_FULL_GDD.md`

---

## 기술 스택

- **엔진**: Phaser 3.60 (npm)
- **번들러**: Vite 5
- **물리**: Arcade Physics (gravity: 0)
- **언어**: JavaScript ES modules
- **캔버스**: 390×844, `Scale.FIT`, `activePointers: 3`

개발 서버: `npm run dev` → `http://localhost:5173`

---

## 씬 구조

```
BootScene  →  GameScene  (병렬)  UIScene
               ↑ 이벤트 버스로 연결
```

- **BootScene** (`src/scenes/BootScene.js`): 에셋 로드, 프로그래밍 텍스처 생성, GameScene 시작
- **GameScene** (`src/scenes/GameScene.js`): 게임 로직 총괄. `this.player`, `this.input$`, `this.enemyManager`, `this.attackManager`, `this.roomManager` 보유
- **UIScene** (`src/scenes/UIScene.js`): HUD 오버레이. `init(data)`로 `gameScene` 참조 수신. `scene.get('GameScene').events.on(...)` 으로 이벤트 수신

**GameScene 생성 순서 (순서 중요):**
```js
this.enemyManager  = new EnemyManager(...)   // 먼저 생성
this.attackManager = new AttackManager(...)  // enemyManager.foxGroup 참조하므로 뒤에
```

---

## 소스 파일 맵

```
src/
├── main.js                     GAME_W=390, GAME_H=844, Phaser 설정
├── scenes/
│   ├── BootScene.js            에셋 로드 + 텍스처 생성
│   ├── GameScene.js            메인 게임 루프
│   └── UIScene.js              HUD (HP바, 충전게이지, 미니맵, 스킬슬롯)
├── entities/
│   ├── Player.js               이동, HP, 8방향 스프라이트, facingDir
│   ├── Fox.js                  적 AI (idle/chase/flee/stun), HP바, dispose()
│   └── Core.js                 드롭 아이템 (코어), 수집 시 coreCount++
├── systems/
│   ├── AttackManager.js        A(근거리)/B(원거리) 이중 충전 공격, 투사체 관리
│   └── EnemyManager.js         Fox 스폰/정리, 공격 히트판정 수신, dropCores()
├── utils/
│   └── InputManager.js         가상 조이스틱 + WASD 폴백
└── world/
    ├── DungeonGenerator.js     8×6 격자 랜덤 워크 (순수 JS, Phaser 의존 없음)
    ├── Room.js                 방 렌더링 + 물리 벽/장애물/문 잠금
    └── RoomManager.js          방 전환, 카메라, 문 트리거
```

---

## 핵심 아키텍처 패턴

### 물리 오브젝트 생성 규칙
**반드시 `add.rectangle` 사용. `add.circle`(Arc)은 physics.add.existing과 함께 쓰면 body 위치 동기화 불가.**

```js
// ✅ 올바른 방법
const go = scene.add.rectangle(x, y, w, h, color);
scene.physics.add.existing(go);          // dynamic body
scene.physics.add.existing(go, true);    // static body

// ❌ 금지
const go = scene.add.circle(x, y, r, color);
scene.physics.add.existing(go);  // 이동하지 않음
```

### 이미지 기반 물리 오브젝트 (Player)
```js
this.gameObject = scene.add.image(x, y, 'soma-bottom');
this.gameObject.setDisplaySize(DISPLAY_W, DISPLAY_H);  // 표시 크기
scene.physics.add.existing(this.gameObject);
this.gameObject.body.setSize(BODY_SIZE, BODY_SIZE, true);  // hitbox (center=true)
```
텍스처 교체 후 반드시 `setDisplaySize` 재호출 필요 (스케일 초기화됨).

### 이벤트 버스 패턴
```js
// GameScene 이벤트 발행
this.scene.events.emit('attack-fired', { tierData, playerX, playerY, aimDir });
this.scene.events.emit('room-entered', { roomData, dungeonData });
this.scene.events.emit('all-enemies-dead');

// 다른 시스템에서 수신
scene.events.on('attack-fired', this._onAttackFired, this);
```

### 방(Room) 정리 패턴
```js
// 방 전환 시 반드시 dispose() 호출 (HP바 포함 전체 정리)
fox.dispose();   // gameObject + _hpBg + _hpFill + blinkEvent 전부 정리
```

---

## 공격 시스템

### 충전 공격 (AttackManager)
- **A버튼 / Z키**: 근거리 원형 AoE. 충전 시간 → 반경(60/72/90px), 피해(20/24/28)
- **B버튼 / X키**: 원거리 투사체. 충전 시간 → 크기(7/9/12px), 피해(10/14/20). 속도 450px/s
- 투사체는 `_projGroup`(physics group) + `_wallCollider`(room 전환 시 재설정) 로 관리
- UIScene은 `atk.tierColor`, `atk.tierLabel` 읽어서 게이지 표시

### 히트판정
- **근거리**: `'attack-fired'` 이벤트 → EnemyManager가 `Phaser.Math.Distance` 로 원형 판정
- **원거리**: `physics.add.overlap(projGroup, foxGroup, callback)` → AttackManager가 직접 처리
- 벽 충돌: `physics.add.collider(projGroup, room.wallGroup, callback)` (room 전환마다 재등록)

---

## 방 시스템

### 상수 (Room.js)
```
ROOM_W = 390, ROOM_H = 844, WALL_T = 20, DOOR_W = 60
DOOR_HX = 165 (수평 문 X 시작)
DOOR_VY = 392 (수직 문 Y 시작)
```

### 문 트리거 임계값 (RoomManager.js)
```js
const TRIGGER_MARGIN = 20;  // 방 가장자리에서 20px 이내 진입 시 전환
// up:    py < 20        (player min y = 16)
// down:  py > 824       (player max y = 828)
// left:  px < 20        (player min x = 16)
// right: px > 370       (player max x = 374)
```

### 던전 생성 결과 구조
```js
{
  rooms: [{ id, row, col, doors: {up, down, left, right}, visited, cleared, type }],
  startId: 0,
  gridCols: 8, gridRows: 6
}
```
`doors[dir]` = 연결된 방 id (null = 막힌 벽)

---

## 플레이어 캐릭터 (soma)

- 이미지 경로: `public/assets/characters/soma-{direction}.png`
- 방향: `top`, `top-right`, `right`, `bottom-right`, `bottom`, `bottom-left`, `left`, `top-left`
- 표시 크기: `DISPLAY_W=64, DISPLAY_H=72` (Player.js 상단 상수)
- Hitbox: `BODY_SIZE=28` (center 정렬)
- 방향 전환: `Math.atan2(y, x)` → 45° 단위 8방향 매핑

---

## UIScene HUD 레이아웃

```
[충전 게이지]  ── 상단 중앙, CHARGE_W=200
[HP 바]        ── 좌상단 y=60, HP_BAR_W=180
[코어 카운터]  ── 우상단 (HP 줄 기준)
[미니맵]       ── 우상단 (코어 아래), MM_CW=13 MM_CH=9
[스킬 슬롯 A]  ── 우하단, 56×56px, color=0x4ecca3
[스킬 슬롯 B]  ── 스킬 슬롯 A 왼쪽, color=0xe63946
```

B슬롯 화면 좌표: `center=(276, scale.height-48)` — AttackManager의 `_inBSlot()` 과 일치해야 함.

---

## 에셋 로딩

BootScene.preload() 에서 로드:
```js
['top','top-right','right','bottom-right','bottom','bottom-left','left','top-left']
  .forEach(d => this.load.image(`soma-${d}`, `assets/characters/soma-${d}.png`));
```
public/ 폴더 = Vite 정적 서빙 루트. 코드에서 `/assets/...` 로 접근.

---

## 개발 규칙

1. 물리 오브젝트는 항상 `add.rectangle` 사용 (Arc 금지)
2. 상수값(속도, 피해량, 크기)은 파일 상단 `const` 로 분리
3. 씬 간 통신은 이벤트 버스 (`scene.events.emit/on`)
4. 적/방 정리 시 반드시 `dispose()` 패턴 사용 (HP바 메모리 누수 방지)
5. EnemyManager는 AttackManager보다 먼저 생성 (foxGroup 참조 의존)
6. 투사체 wall collider는 `room-entered` 이벤트마다 재설정
