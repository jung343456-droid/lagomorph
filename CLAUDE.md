# LAGOMORPH — Claude Code 개발 컨텍스트

## 프로젝트 개요

Phaser 3.60 탑다운 로그라이크. 모바일(390×844 portrait) 우선, Capacitor 패키징 예정.
플레이어는 강화 토끼 VOSS-7(코드명 soma). 설계 문서: `design/LAGOMORPH_FULL_GDD.md`

개발 서버: `npm run dev` → `http://localhost:5173`

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
│   ├── BootScene.js        에셋 로드 + 텍스처 생성
│   ├── GameScene.js        메인 게임 루프
│   └── UIScene.js          HUD (HP바, 충전게이지, 미니맵, 스킬슬롯)
├── entities/
│   ├── Player.js           이동, HP, 8방향 스프라이트, facingDir
│   ├── Fox.js              추격형 (idle/chase/flee/stun)
│   ├── Rat.js              돌진형 군집 (idle/rush/cooldown/stun), 3마리 묶음 스폰
│   ├── Weasel.js           기습형 (idle/approach/dash/cooldown/stun)
│   ├── Hedgehog.js         방어형 (idle/chase/spike/stun), 가시 AoE·무적
│   ├── Squirrel.js         원거리형 (idle/kite/stun), 도토리 투사체
│   └── Core.js             드롭 아이템, 수집 시 coreCount++
├── systems/
│   ├── AttackManager.js    A(근거리 AoE)/B(설치형 트랩) 공격, 충전 게이지
│   └── EnemyManager.js     적 스폰/정리 (가중치 테이블), 히트판정, 투사체 수동 이동
├── utils/
│   └── InputManager.js     가상 조이스틱 + WASD 폴백
└── world/
    ├── DungeonGenerator.js 8×6 격자 랜덤 워크
    ├── Room.js             방 렌더링 + 물리 벽/장애물/문 잠금
    └── RoomManager.js      방 전환, 카메라, 문 트리거
```

---

## 핵심 아키텍처

### 물리 오브젝트
**`add.rectangle` 만 사용. `add.circle`(Arc)은 physics body 위치 동기화 불가 — 사용 금지.**

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
| A / Z | 근거리 원형 AoE (충전) | 반경 60/72/90px, 피해 10/12/14 |
| B / X | 설치형 트랩 | 코어 3개 소모, 쿨다운 0.5s, 피해 30, 크기 22px, 최대 5개 |

히트판정:
- **근거리**: `attack-fired` 이벤트 → EnemyManager가 `Phaser.Math.Distance` 원형 판정
- **설치형**: `physics.add.overlap(_poopGroup, enemyGroup)` → AttackManager 처리
- **적 투사체**: EnemyManager `_enemyProjs` 수동 이동, 플레이어와 22px 이내 시 피격

---

## 적 스폰 테이블

| 타입 | 가중치 | 비고 |
|---|---|---|
| fox | 3 | |
| rat | 2 | 선택 시 3마리 묶음 스폰 |
| weasel | 2 | |
| hedgehog | 1 | |
| squirrel | 1 | |

---

## 방 시스템

**Room.js 주요 상수**: `ROOM_W=390`, `ROOM_H=844`, `WALL_T=20`, `DOOR_W=60`, `DOOR_HX=165`, `DOOR_VY=392`

문 전환: 플레이어가 방 가장자리 20px 이내 + 문 통로 범위 진입 시 페이드 전환.

---

## 플레이어 / HUD

- 스프라이트: `public/assets/characters/soma-{direction}.png` (8방향)
- 표시 크기: `DISPLAY_W=64, DISPLAY_H=72` / Hitbox: `BODY_W=48, BODY_H=46`
- B슬롯 좌표: `center=(276, scale.height-130)` — AttackManager `_inBSlot()` 과 일치해야 함

---

## 개발 규칙

1. 물리 오브젝트는 항상 `add.rectangle` 사용 (Arc 금지)
2. 상수값(속도, 피해량, 크기)은 파일 상단 `const` 로 분리
3. 적/방 정리 시 반드시 `dispose()` 호출 (HP바 메모리 누수 방지)
4. EnemyManager는 AttackManager보다 먼저 생성 (enemyGroup 참조 의존)
5. 적 투사체는 physics body 없이 수동 이동 — `physics.add.group().add()` 는 body를 덮어씀
6. **`src/entities/` 캐릭터 파일 작업 시 반드시 파일 상단 주석을 함께 갱신** — HP·속도·데미지·쿨다운 등 수치, AI 상태 전환 조건, 특수 동작이 변경되면 주석도 즉시 반영한다.
