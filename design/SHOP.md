# LAGOMORPH — 상점 시스템

## 핵심 컨셉
- **희소성**: 구역당 표시 2·4·7·9층 각 1개 상점 (구역 1~4 공통 패턴)
- **안전 지대**: 적 없음, 문 자동 개방, 진입 즉시 `cleared=true`, 장애물 없음
- **NPC 근접 자동 오픈**: 상인 NEAR_R(85px) 이내 진입 시 `shop-open-requested` 이벤트 자동 발행 → 상점 창(오버레이) 오픈

## 배치 규칙
- **각 구역 표시 2·4·7·9층 각 1개** 상점방 생성 — 절대 층 기준: 구역 1: 2·4·7·9층 / 구역 2: 12·14·17·19층 /
  구역 3: 22·24·27·29층 / 구역 4: 32·34·37·39층 (`DungeonGenerator.generateDungeon`)
- 시작방·보스방 제외한 일반 전투방 1개를 `type='shop'`으로 치환
- 시작방에서 거리 ≤ 전체 전투방 수의 절반 우선 (탐색 보장)
- 미니맵 노란 `$` 아이콘 (`0xddcc22`)

## NPC: 잿빛털 토끼 상인 GRIM
- 잿빛(`#8a8a86`) 털, 한쪽 귀 흉터, 어깨에 가방
- 정면 1프레임 + 미세 호흡 트윈 (`scaleY × 1.05`, 1500ms Sine.InOut yoyo)
- 위치: 방 중앙 상단 (`y = ROOM_H * 0.32`)
- 표시 크기: 40×50px
- **탁자**: 상인 바로 앞(아래) 정적 static body 사각형 (56×14px, 갈색 `0x6b4226`). 플레이어와 충돌. 상인 몸체 하단 + 4px 여백 위치.
- 에셋(예정): `public/assets/characters/grim.png`. 미존재 시 잿빛 rectangle 폴백.

## 상점 창(모달) UX
- 게임 일시정지 (`GameScene.scene.pause()` / `.resume()`)
- 반투명 검정 배경(`0x000000` α=0.75), 외부 영역 탭 시 닫기
- 중앙 패널 320×(슬롯 수에 따라 가변) — headerH(60) + slotCount × cardH(110) + (slotCount-1) × gap(8) + footerH(30)
- 상단: "GRIM 상점" 텍스트(좌) + 보유 코어 `◆ N`(우) + [✕] 닫기 버튼(우상단)
- 중앙: 슬롯 카드 N개 세로 배치 (기본 3, '상인의 호의' 보유 시 +1) — 아이콘 / 이름 / 효과 / 가격 / 탭으로 구매
- 하단: 닫기 버튼 없음 (패널 외부 탭 또는 ✕ 버튼)
- 입력: 터치·포인터 탭만 지원 (키보드 ↑↓/Z/X 미구현)
- 상점 오픈 중 HP·코어 카운터 즉시 반영

## 판매 슬롯 (기본 3개, '상인의 호의' 해금 시 4개, 전부 랜덤)

방 생성 시 아래 풀에서 슬롯 수만큼 가중치 무작위로 뽑아 채운다. 슬롯 수 = 3 + `player.shopSlotBonus`.

### 판매 풀

| 종류 | id | 이름 | 가격 | 효과 |
|---|---|---|---|---|
| 패시브 아이템 | `item` | (방 생성 시 미리 선정된 특정 패시브) | 75 | `ITEM_DEFS` 중 1개 사전 선정 — 카드에 실제 이름/설명 노출 |
| 회복 1 | `heal_1` | 토끼풀 한 줌 | 5  | HP +8 |
| 회복 2 | `heal_2` | 민들레잎 | 10 | HP +16 |
| 회복 3 | `heal_3` | 무 조각 | 15 | HP +24 |
| 회복 4 | `heal_4` | 잘 익은 당근 | 20 | HP +32 |
| 회복 5 | `heal_5` | 사과 조각 | 25 | HP +40 |
| 회복 6 | `heal_6` | 빨간 사과 | 30 | HP +48 |
| 회복 7 | `heal_7` | 야생 베리 한 줌 | 35 | HP +56 |
| 회복 8 | `heal_8` | 채소 샐러드 | 40 | HP +64 |
| 50% 회복 | `heal_half` | 푸짐한 한 끼 | 50 | HP를 `maxHp * 0.5`만큼 회복 |
| 전체 회복 | `heal_full` | 정원의 만찬 | 75 | HP를 maxHp로 |

> 정액 회복(`heal_1`~`heal_8`)은 maxHp가 낮을 때 가성비 우위. `heal_half`는 maxHp가 클수록 가성비 우위 — `tough_hide` 빌드와 시너지.

### 뽑기 규칙
- 가중치: 패시브 30% / 정액 회복 8단계 55% (균등) / `heal_half` 10% / `heal_full` 5%
- 슬롯 간 같은 id 중복 금지 — 충돌 시 재추첨 (최대 `targetCount × 14`회 후 강제 통과)
- 패시브 슬롯이 두 번 뽑히면 서로 다른 패시브여야 함
- 이미 보유한 패시브는 `item` 슬롯 후보에서 제외 (생성 시점 + 상점 오픈 시점 두 번 체크)
- 상점 오픈 시점에 보유 중인 패시브와 충돌하는 슬롯은 미보유 패시브로 재추첨, 후보 없으면 `sold=true` 처리
- 회복 아이템: `대식가(big_trap)` 패시브 보유 시 `healItemMult`만큼 회복량 증가

## 구매 플로우
1. 카드 탭 → 코어 충분: `em.spendCores(cost)` → 효과 즉시 적용 → 카드 SOLD 상태 (어둡게)
2. 코어 부족: 가격 빨강 깜빡임 + 스케일 펄스 트윈
3. 이미 SOLD: 무반응

## 데이터 모델

```js
roomData.type = 'shop';
roomData.shopSlots = [
  { kind: 'item',      id: 'sharp_claws', name: '예리한 발톱', desc: '근거리 공격 데미지 ×1.20', color: 0x00ccff, cost: 45, sold: false },
  { kind: 'heal',      id: 'heal_3',      name: '무 조각',     amount: 24, cost: 15, sold: false },
  { kind: 'heal_pct',  id: 'heal_half',   name: '푸짐한 한 끼', ratio: 0.5, cost: 50, sold: false },
  // 또는
  { kind: 'heal_full', id: 'heal_full',   name: '정원의 만찬',  cost: 75, sold: false },
];
```

재진입 시 `sold` 유지. `roomData.shopSlots`는 던전(층) 단위 영속.

## 구현 위치

| 역할 | 파일 |
|---|---|
| 상점방 슬롯 추첨 + 방 type 치환 | `src/world/DungeonGenerator.js` |
| 상점방 바닥 톤 오버레이 + 장애물 제거 | `src/world/Room.js` |
| 상점방 적 스폰 스킵, 즉시 `cleared=true` | `src/world/RoomManager.js` |
| NPC 배치, 호흡 트윈, 탁자, 근접 감지 | `src/entities/Shopkeeper.js` |
| 모달 렌더, 카드 입력, 구매 처리, 일시정지 | `src/scenes/UIScene.js` (`openShop` / `closeShop`) |
| NPC 라이프사이클, `shop-open-requested` 수신 | `src/scenes/GameScene.js` |
| 코어 차감 | `src/systems/EnemyManager.js` (`spendCores`) |
| `shopSlotBonus` / `shopPriceMult` 스탯 | `src/entities/Player.js` |
| 미니맵 상점방 색상 분기 (노란색) | `src/scenes/UIScene.js` |

## 영구 해금 연동
- **상인의 호의**: 슬롯 +1 (기본 3 → 4) — `player.shopSlotBonus`
- **상인의 신용**: 모든 슬롯 가격 `×0.9`, Math.floor (최소 1) — `player.shopPriceMult`
- `generateDungeon()` 호출 시 `player.shopSlotBonus` / `player.shopPriceMult` 인자로 전달

## 가격 층 스케일링 (구역별 복리 인플레)

강화 구역(짝수 구역 2·4)에서 적 코어 드롭이 `×1.5`(`ZONE34_CORE_MULT`, `EnemyManager`) 인플레되는 것과
별개로, 상점 가격은 구역이 오를 때마다 그 자체 배율로 곱연산 누적된다 — 코어 드롭 배율과는 독립적으로
튜닝되는 값이다. 구역별 개별 하드코딩이 아니라 `zoneOf` 기반 공식(`zonePriceMult`, `src/constants.js`)이라
3·4구역 상점 추가 시에도 코드 변경 없이 자동 적용된다.

- `zonePriceMult(floor) = SHOP_ZONE_MULT ** (zoneOf(floor) - 1)`, `SHOP_ZONE_MULT = 1.7` → **구역 1 ×1.0 /
  구역 2 ×1.7 / 구역 3 ×2.89 / 구역 4 ×4.913** (`src/constants.js`, `GameScene`에서 `generateDungeon` 호출 시 사용)
- 해금 할인(`player.shopPriceMult`)과 **곱연산** 합성 후 `generateDungeon(..., shopPriceMult)`에 전달.
  슬롯 가격은 `_entryToSlot`의 `Math.max(1, Math.floor(raw × mult))`로 적용(기존 플러밍 재사용).
- 예: 전체 회복 75 → 구역 2 약 127 / 구역 3 약 216 / 구역 4 약 368, '상인의 신용' 동반 시 75 × 1.7 × 0.9 ≈ 114(구역 2).

## 코어 제단 (Core Altar) — 후반 잉여 코어 소모처

**비밀방(보물방)의 제단 분기**로 등장하는 런 한정 강화 제단. 상점이 회복/패시브를
판다면, 제단은 **코어를 이번 런 한정 스탯 파워로 교환**한다(역할 분리). 비밀방은 보물방/제단방/엘리트방이
각 1/3 — 제단은 매 층 보장되지 않고 비밀 벽을 찾아 들어가야 확률적으로 만난다(`design/LAGOMORPH_SECRET_ROOMS.md` §3).

- **목적**: 후반엔 공급(코어 드롭)이 늘지만 소모처가 고정이라 코어가 남는다. 제단은 잉여를 흡수하면서
  "지금 지를까 / 모을까" 결정을 살린다. **메타 적립은 픽업 기준(`_runPicked`)이라
  제단 소모와 무관** — 소모해도 영구 해금 속도는 줄지 않는다(`design/SAVE_SYSTEM.md` 참조).
- **등장/정리**: 제단 비밀방(`secret_cache`, `cacheSubtype='altar'`) 진입 시 `GameScene` room-entered
  핸들러가 `Altar`를 방 중앙에 스폰, 방을 떠나면 정리. 던전 데이터에 방 종류가 직렬화되어 이어하기 복원 시
  재진입하면 다시 스폰된다.
- **상호작용**: `Altar` NPC 근접(NEAR_R 70px) 시 `altar-open-requested` 발행 → 상점 오버레이 재사용
  (`UIScene.openAltar`). 매 오픈마다 `ALTAR_POOL`에서 3개 랜덤 추첨. 슬롯 `kind:'upgrade'`.
- **가격 누진(escalating)**: `cost(n) = round(ALTAR_BASE 20 × ALTAR_GROWTH 1.5^n)`,
  `n = EnemyManager._altarPurchases`(런 누적 구매). 한 번 사면 모든 슬롯 가격이 같이 오른다 →
  20·30·45·68·101·152… 후반일수록(=많이 살수록) 코어를 더 많이 빨아들이고 한계효용이 자연 감소.
  **sold 없이 반복 구매 가능**(가격만 상승).

### 제단 강화 풀 (`src/data/AltarPool.js`, 런 한정·중복 누적)

| id | 이름 | 효과 |
|---|---|---|
| `altar_hp`     | 강철 심장 | 최대 HP +20 (+20 회복) |
| `altar_melee`  | 예리한 발톱 | 근접 피해 +10% (`meleeDamageMult`) |
| `altar_charge` | 신속 충전 | 충전 속도 +10% (`chargeSpeedMult`) |
| `altar_trap`   | 덫 증설 | 설치 덫 최대 +1 (`trapMaxBonus`) |
| `altar_radius` | 확장 파동 | 근접 범위 +8% (`meleeRadiusMult`) |

> 효과는 Player 기존 스탯 필드를 갱신 → `Player.serialize()`가 자동 보존(임시저장 복원). 누진 카운트만
> `EnemyManager.serialize().altarPurchases`로 별도 저장.

### 제단 구현 위치

| 역할 | 파일 |
|---|---|
| 강화 풀 정의 + 누진 비용 공식 | `src/data/AltarPool.js` (`ALTAR_POOL`, `altarCostFor`) |
| 제단 NPC(시각·근접 감지) | `src/entities/Altar.js` |
| 누진 카운터·현재가·기록 | `src/systems/EnemyManager.js` (`altarCost` / `recordAltarPurchase` / `_altarPurchases`) |
| 오버레이 재사용(제단 모드) | `src/scenes/UIScene.js` (`openAltar`, `_shopMode === 'altar'`) |
| 계단 동반 스폰/정리, 이벤트 수신 | `src/scenes/GameScene.js` (`_spawnStairs`/`_disposeStairs`, `altar-open-requested`) |

## 의도적으로 뺀 것
- 최대 HP 영구 증가 슬롯
- 재입고/리롤, 상점 도난, NPC 대화 트리
- NPC 근접 힌트 텍스트 ("상점 열기" 안내 UI)
- 키보드 방향키·Z/X 탐색

## 확장 여지
- 4층 / 9층 상점 풀 차별화 (희귀 회복, 멀티 적용 효과)
- GRIM의 정체 — ARCANA 폐기 유닛 스토리 연계
