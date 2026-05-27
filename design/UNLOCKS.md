# LAGOMORPH — 영구 해금 시스템

런 간 유지되는 메타 진행. 사망/클리어로 사라지는 패시브 아이템(`design/ITEMS.md`)과 달리, 해금 노드는 localStorage 에 영속 저장되어 다음 런 시작 스탯·플래그에 반영된다.

## 핵심 컨셉
- **재화는 메타 코어 1종** — 런 중 픽업한 코어만 영속 적립
- **3계열 × 4단계 = 12노드** — 공격 / 생존 / 특수, 각 계열 tier 순서대로만 해금 가능 (선행 prereq)
- **효과 적용 시점은 Player 생성 직후** — `applyUnlocksToPlayer()` 가 시작 스탯·플래그를 변경
- **상태 표기**: ✅ = 효과까지 동작, 🔧 = 노드는 구매 가능하나 효과 미구현(후속 goal)

---

## 메타 코어 적립 규칙

- 시작 시 부여되는 30 코어는 **메타 적립 대상 아님** (`EnemyManager.coreCount` 초기 할당)
- 런 중 픽업한 코어 1개당 **+1** 메타 코어 영속 적립 (`EnemyManager.update()` 자석 충돌 분기)
- 사망 / ZONE CLEAR / 보스 보너스 등 별도 보상 없음 — 픽업 기반 단일 출처
- 코어 수집기 노블 해금 시 드롭 코어량 ×1.15 (런 강화에 영향, 적립량과 동일)

---

## 진입 동선 (UI)

- **Hub 의 GRIM NPC 에 근접** → 영구 해금 메뉴 (`UnlockMenu`) 오픈
  - GRIM 등장 조건: 상점방을 한 번이라도 진입 (런 중 자동 마킹)
  - `lagomorph_shop_discovered` 가 true 인 경우에만 HubScene 좌측에 등장
- **GAME OVER / ZONE CLEAR 화면에는 해금 진입점 없음** — "허브로 돌아가기" 버튼 단일
- 메뉴 닫기: ESC 또는 ✕ 버튼

---

## 영구 해금 트리

### 공격 계열

| 순서 | 이름 | 효과 | 코어 | 상태 |
|---|---|---|---|---|
| 1 | 발톱 강화 I | 근거리 데미지 ×1.05 (`meleeDamageMult +0.05`) | 40 | ✅ |
| 2 | 파동 확장 | 근거리 반경 ×1.15 (`meleeRadiusMult +0.15`) | 80 | ✅ |
| 3 | 충전 가속 | 근거리 충전 속도 ×1.20 (`chargeSpeedMult +0.20`) | 160 | ✅ |
| 4 | 임계 분노 | 치명타율 +8% (15→23%) | 300 | ✅ |

### 생존 계열

| 순서 | 이름 | 효과 | 코어 | 상태 |
|---|---|---|---|---|
| 1 | 강인한 몸 I | 시작 HP +10 (`maxHp`, `hp` 동시) | 40 | ✅ |
| 2 | 두꺼운 가죽 I | 받는 피해 -5% (`damageReduction += 0.05`, 최소 1 보장) | 80 | ✅ |
| 3 | 전투 적응 | 방 클리어 시 HP +5 (`hpPerRoomClear`) | 160 | ✅ |
| 4 | 최후의 발버둥 | 1회 사망 무효 (런당) | 400 | 🔧 |

### 특수 계열

| 순서 | 이름 | 효과 | 코어 | 상태 |
|---|---|---|---|---|
| 1 | 상인의 호의 | 상점 슬롯 +1 (3 → 4) (`shopSlotBonus +1`) | 50 | ✅ |
| 2 | 코어 수집기 | 드롭 코어량 ×1.15 (`coreDropMult`) | 90 | ✅ |
| 3 | 기억 단편화 | 시작 시 추가 아이템 1개 | 180 | 🔧 |
| 4 | VOSS 프로토콜 | 레전드 드롭률 +3% | 360 | 🔧 |

> 변경 이력 (설계 정정):
> - 공격 t3: 관통 각인 → **충전 가속** (3단계 관통 기능 폐기)
> - 생존 t2: 회피 본능 → **두꺼운 가죽 I** (대시 시스템 미도입으로 폐기)
> - 특수 t1: 예민한 감각 → **상인의 호의** (이벤트방 미도입으로 폐기)

---

## 데이터 / 파일 매핑

| 역할 | 위치 |
|---|---|
| 노드 정의(name·desc·cost·prereq·apply) | `src/data/UnlockTree.js` (`UNLOCK_NODES`) |
| 메타 코어/해금 ID 영속 저장 + 적용 헬퍼 | `src/data/MetaProgress.js` (`applyUnlocksToPlayer`) |
| 메뉴 UI 렌더링 | `src/ui/UnlockMenu.js` |
| 진입 트리거 NPC | `src/entities/Shopkeeper.js` (HubScene 인스턴스, GRIM) |
| 저장 키 | `lagomorph_meta_cores`, `lagomorph_unlock_nodes`, `lagomorph_shop_discovered` (localStorage) |

---

## 노드 추가 / 수정 시 체크리스트

1. `src/data/UnlockTree.js` 의 `UNLOCK_NODES` 에 노드 추가 (branch·tier·prereq·cost·name·desc·apply)
2. `apply(player)` 는 `applyUnlocksToPlayer()` 시점에 호출되므로 **시작 스탯/플래그만** 변경 (런 진행 중 호출되지 않음)
3. 효과가 후속 시스템 의존이면 `apply: null` 로 등록 + 본 문서 표의 상태를 🔧 로 표기
4. tier > 1 이면 같은 branch 의 직전 tier 노드를 `prereq` 로 지정
5. 코어 비용·이름·효과 변경 시 본 문서 표도 함께 갱신
