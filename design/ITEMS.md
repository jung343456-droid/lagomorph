# LAGOMORPH — 아이템 목록

아이템은 `src/entities/PassiveItem.js`의 `ITEM_DEFS`에 정의된다.

**스폰 규칙**
- **시작 방**: 이전 런에서 한 번이라도 획득(`collect`)한 아이템 중 랜덤 1개 스폰. 처음 플레이 시(unlock 없음)에는 스폰 안 함.
- **보스방 클리어 시**: `ITEM_DEFS` 전체에서 랜덤 1개 드롭. 첫 런부터 획득 가능.
- unlock 목록은 `localStorage['lagomorph_unlocked']`에 JSON 배열로 저장 (런 간 영속).

---

## 현재 구현된 아이템

| ID | 이름 | 색상 | 효과 | 적용 위치 |
|---|---|---|---|---|
| `wide_claws` | 넓은 발톱 | 주황 `0xff8800` | 근거리 공격 반경 ×1.33 | `player.meleeRadiusMult += 0.33` |
| `sharp_claws` | 예리한 발톱 | 청록 `0x00ccff` | 근거리 공격 데미지 ×1.20 | `player.meleeDamageMult += 0.20` |
| `poison_claws` | 독성 발톱 | 보라 `0xaa44ff` | 근거리 공격 명중 시 10초간 독 (maxHp×0.5%/s, 최소 1/s) | `player.hasPoison = true` |
| `explosive_trap` | 폭발 트랩 | 적주황 `0xff4400` | 설치물 명중 시 반경 40px 스플래시 데미지 15 | `player.hasExplosiveTrap = true` |
| `frugal_instinct` | 절약 본능 | 노랑 `0xffdd00` | 설치물 코어 소모 3→2 | `player.trapCostBonus += 1` |
| `big_trap` | 큰 볼일 | 갈색 `0x885500` | 설치물 크기 ×2 (22→44px) | `player.trapSizeMult *= 2` |

---

## Player 스탯 프로퍼티 (`src/entities/Player.js`)

| 프로퍼티 | 기본값 | 설명 |
|---|---|---|
| `meleeRadiusMult` | `1.0` | 근거리 공격 반경 배율 |
| `meleeDamageMult` | `1.0` | 근거리 공격 데미지 배율 |
| `hasPoison` | `false` | 명중 시 독 부여 여부 |
| `hasExplosiveTrap` | `false` | 트랩 폭발 스플래시 여부 |
| `trapCostBonus` | `0` | 트랩 코어 소모 감소량 (실제 소모 = max(1, 3 - bonus)) |
| `trapSizeMult` | `1` | 트랩 크기 배율 |

---

## 독 시스템 (`src/systems/EnemyManager.js`)

- 중독 상태: `_poisoned` Map — `{ timer: 10, accum: 0 }`
- 중첩 없음: 이미 중독 중이면 재적용 불가 (10초 만료 후 재적용 가능)
- 시각: 중독 중 HP바 보라색(`0xaa44ff`) → 만료 시 초록(`0x44dd44`) 복원
- 사망 시: HP바 파괴되므로 별도 복원 불필요

---

## 아이템 추가 시 체크리스트

1. `src/entities/PassiveItem.js` — `ITEM_DEFS`에 항목 추가 (id, name, color, apply)
2. `src/entities/Player.js` — 필요한 스탯 프로퍼티 추가 (기본값 포함)
3. 효과 적용 코드 — `AttackManager.js` 또는 `EnemyManager.js`에 배율/플래그 반영
4. `src/scenes/GameScene.js` — 아이템 추가 시 별도 작업 불필요 (`Object.keys(ITEM_DEFS)`로 자동 포함)
5. **이 파일(ITEMS.md) 갱신**
