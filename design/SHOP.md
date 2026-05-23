# LAGOMORPH — 상점 시스템

## 핵심 컨셉
- **희소성**: 1런에 2개 상점 (짝수층 2층·4층 각 1개)
- **안전 지대**: 적 없음, 문 자동 개방, 진입 즉시 `cleared=true`
- **NPC 접근 모달**: 상인 NPC 22px 이내에서 B 버튼 → 상점 창(오버레이) 오픈. 상품은 바닥에 뿌리지 않음.

## 배치 규칙
- **짝수층(2·4층) 각 1개** 상점방 생성
- 시작방·보스방·출구방 제외한 일반 전투방 1개를 `type='shop'`으로 치환
- 시작방에서 거리 ≤ 2 우선 (탐색 보장)
- 미니맵 노란 `$` 아이콘

## NPC: 잿빛털 토끼 상인 GRIM
- 잿빛(`#8a8a86`) 털, 한쪽 귀 흉터, 어깨에 가방
- 정면 1프레임 + 미세 호흡 트윈
- 위치: 방 중앙 상단 (`y ≈ ROOM_H * 0.32`)
- 근접 시 머리 위에 ▼ + "B로 상점 열기" 힌트
- 에셋(예정): `public/assets/characters/grim.png`. 미존재 시 잿빛 rectangle 폴백.

## 상점 창(모달) UX
- 게임 일시정지 (`physics.pause()` + `time.timeScale=0` 또는 `GameScene` `pause()`)
- 반투명 검정 배경(`0x000000` α=0.7), 중앙 패널 300×500
- 상단: 상인 초상화 + "GRIM" / 우상단: 보유 코어 `◆ 23`
- 중앙: 슬롯 카드 3개 세로 배치 (각 90px) — 아이콘 / 이름 / 효과 / 가격 / [구매]
- 하단: [닫기] 버튼 (화면 외곽 터치로도 닫힘)
- 입력: 터치 = 카드 직접 탭 / 키보드 = ↑↓ + Z(구매) + X(닫기)

## 판매 슬롯 (3개, 전부 랜덤)

방 생성 시 아래 풀에서 3개를 가중치 무작위로 뽑아 슬롯에 채운다.

### 판매 풀

| 종류 | id | 이름 | 가격 | 효과 |
|---|---|---|---|---|
| 패시브 아이템 | `item` | (랜덤 패시브) | 20 | `ITEM_DEFS` 중 미보유 우선 1개 |
| 회복 1 | `heal_1` | 토끼풀 한 줌 | 1 | HP +8 |
| 회복 2 | `heal_2` | 민들레잎 | 2 | HP +16 |
| 회복 3 | `heal_3` | 무 조각 | 3 | HP +24 |
| 회복 4 | `heal_4` | 잘 익은 당근 | 4 | HP +32 |
| 회복 5 | `heal_5` | 사과 조각 | 5 | HP +40 |
| 회복 6 | `heal_6` | 빨간 사과 | 6 | HP +48 |
| 회복 7 | `heal_7` | 야생 베리 한 줌 | 7 | HP +56 |
| 회복 8 | `heal_8` | 채소 샐러드 | 8 | HP +64 |
| 50% 회복 | `heal_half` | 푸짐한 한 끼 | 10 | HP를 `maxHp * 0.5`만큼 회복 |
| 전체 회복 | `heal_full` | 정원의 만찬 | 15 | HP를 maxHp로 |

> 정액 회복(`heal_1`~`heal_8`)은 maxHp가 낮을 때 가성비 우위. `heal_half`는 maxHp가 클수록 가성비 우위 — `tough_hide` 빌드와 시너지. 빌드별로 다른 선택이 합리적.

### 뽑기 규칙
- 가중치: 패시브 30% / 정액 회복 8단계 55% / `heal_half` 10% / `heal_full` 5%
- 슬롯 간 **중복 금지** (같은 id 두 장 방지). 패시브 슬롯 1장은 그대로 허용
- 충돌 시 재추첨 (최대 5회 후 강제 통과)
- maxHp 초과분은 잘려 표시 — `현재HP + 회복량 > maxHp`일 때 가격 라벨 회색 "비효율" 표시 (UX 힌트)

## 구매 플로우
1. 카드 탭 → 코어 충분: 차감 → 효과 즉시 적용 → 카드 SOLD 상태 (어둡게)
2. 코어 부족: 가격 빨강 깜빡임 + 짧은 카메라 진동
3. 이미 SOLD: 무반응
4. 모달 닫기 시 게임 재개

## 데이터 모델

```js
roomData.type = 'shop';
roomData.shopSlots = [
  { kind: 'item',      id: 'sharp_claws', name: '예리한 발톱', cost: 20, sold: false },
  { kind: 'heal',      id: 'heal_3',      name: '무 조각',     amount: 24, cost: 3,  sold: false },
  { kind: 'heal_pct',  id: 'heal_half',   name: '푸짐한 한 끼', ratio: 0.5, cost: 10, sold: false },
  // 또는
  { kind: 'heal_full', id: 'heal_full',   name: '정원의 만찬',  cost: 15, sold: false },
];
```

재진입 시 `sold` 유지. `roomData.shopSlots`는 던전(층) 단위 영속.

## 코드 변경 지점
- `src/world/DungeonGenerator.js` — 짝수층 한정 상점방 1개 선정 + `shopSlots` 가중치 추첨
- `src/world/Room.js` — `type==='shop'` 분기: 바닥 톤(`0x3a2818`), 등불 글로우, NPC 스프라이트
- `src/world/RoomManager.js` — `type==='shop'` 분기: 적 스폰 스킵, 즉시 `cleared=true`, 문 잠금 없음
- `src/entities/Shopkeeper.js` (신규) — NPC 근접 감지, 힌트, 모달 트리거 이벤트 emit
- `src/systems/ShopUI.js` (신규) — 모달 렌더, 카드 입력, 일시정지
- `src/entities/Player.js` — `spendCores(n) → bool` 헬퍼
- `src/systems/AttackManager.js` — NPC 근접 + B 버튼 시 트랩 설치 대신 `shop-open` 이벤트
- `src/scenes/UIScene.js` — 미니맵 상점방 색상 분기 (노란색)

## 의도적으로 뺀 것
- 최대 HP 영구 증가 슬롯
- 재입고/리롤, 상점 도난, NPC 대화 트리

## 확장 여지
- 4층 상점 풀 차별화 (희귀 회복, 멀티 적용 효과)
- "코어 수집기" 영구 해금 → 슬롯 4번 또는 가격 할인
- GRIM의 정체 — ARCANA 폐기 유닛 스토리 연계
