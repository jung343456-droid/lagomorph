# LAGOMORPH — 아이템 목록

아이템은 `src/entities/PassiveItem.js`의 `ITEM_DEFS`에 정의된다.

**스폰 규칙**
- **시작 방**: 이전 런에서 한 번이라도 획득(`collect`)한 아이템 중 랜덤 1개 스폰. 처음 플레이 시(unlock 없음)에는 스폰 안 함.
- **보스방 클리어 시**: `ITEM_DEFS` 전체에서 랜덤 1개 드롭. 첫 런부터 획득 가능.
- **상점(짝수층 2·4)**: 패시브 아이템 슬롯은 방 생성 시 `ITEM_DEFS` 중 1개를 미리 선정하여 카드에 이름·설명을 노출. 구매 시 해당 아이템 즉시 적용 + unlock 등록 (가격 45, `design/SHOP.md` 참조).
- unlock 목록은 `localStorage['lagomorph_unlocked']`에 JSON 배열로 저장 (런 간 영속).

---

## 현재 구현된 아이템

| ID | 이름 | 색상 | 효과 | 적용 위치 |
|---|---|---|---|---|
| `wide_claws` | 넓은 발톱 | 주황 `0xff8800` | 근거리 공격 반경 ×1.33 | `player.meleeRadiusMult += 0.33` |
| `sharp_claws` | 예리한 발톱 | 청록 `0x00ccff` | 근거리 공격 데미지 ×1.20 | `player.meleeDamageMult += 0.20` |
| `poison_claws` | 독성 발톱 | 보라 `0xaa44ff` | 근거리 공격 명중 시 30% 확률로 10초간 독 (maxHp×1%/s, 최소 2/s) | `player.hasPoison = true` |
| `fire_claws` | 화염 발톱 | 빨강 `0xff2200` | 근거리 공격 명중 시 30% 확률로 3초 화상 (maxHp×2.5%/s, 최소 4/s) | `player.hasFire = true` |
| `ice_claws` | 얼음 발톱 | 하늘 `0x88ddff` | 근거리 공격 명중 시 30% 확률로 3초 빙결 (이동 불가) | `player.hasIce = true` |
| `swift_feet` | 질주 발 | 초록 `0x00ee66` | 이동속도 ×1.30 | `player.speed *= 1.3; player.baseSpeed *= 1.3` |
| `tough_hide` | 강인한 가죽 | 빨강 `0xff4455` | 최대 HP +50, 즉시 50 회복 | `player.maxHp += 50; player.heal(50)` |
| `quick_claws` | 민첩한 발톱 | 노랑 `0xffee00` | 근거리 충전 속도 ×1.5 | `player.chargeSpeedMult *= 1.5` |
| `thunder_claws` | 감전 발톱 | 황녹 `0xddff22` | 명중 시 반경 70px 내 다른 적에게 연쇄 8 피해 | `player.hasThunder = true` |
| `hunter_instinct` | 사냥꾼의 본능 | 분홍 `0xff6688` | 적 처치 시 HP 5 회복 | `player.healOnKill += 5` |
| `fire_disguise` | 불꽃 위장 | 주황 `0xff5522` | 설치물 명중 시 반경 40px 스플래시 15 + 30% 확률 화상 | `player.hasFireDisguise = true` |
| `ice_disguise` | 냉동 위장 | 하늘 `0x66ccff` | 설치물 명중 시 반경 40px 스플래시 15 + 30% 확률 빙결 | `player.hasIceDisguise = true` |
| `poison_disguise` | 독성 위장 | 연두 `0x88dd44` | 설치물 명중 시 반경 40px 스플래시 15 + 30% 확률 중독 | `player.hasPoisonDisguise = true` |
| `frugal_instinct` | 절약 본능 | 노랑 `0xffdd00` | 설치물 코어 소모 3→2 | `player.trapCostBonus += 1` |
| `big_trap` | 대식가 | 갈색 `0x885500` | 설치물 크기 ×2 (22→44px) | `player.trapSizeMult *= 2` |

---

## Player 스탯 프로퍼티 (`src/entities/Player.js`)

| 프로퍼티 | 기본값 | 설명 |
|---|---|---|
| `meleeRadiusMult` | `1.0` | 근거리 공격 반경 배율 |
| `meleeDamageMult` | `1.0` | 근거리 공격 데미지 배율 |
| `hasPoison` | `false` | 명중 시 30% 확률로 독 부여 여부 |
| `hasFire` | `false` | 명중 시 30% 확률로 화상 부여 여부 |
| `hasIce` | `false` | 명중 시 30% 확률로 빙결 부여 여부 |
| `hasThunder` | `false` | 명중 시 인접 적 연쇄 피해 여부 |
| `healOnKill` | `0` | 적 처치 시 회복 HP량 |
| `chargeSpeedMult` | `1.0` | 근거리 충전 속도 배율 (AttackManager의 유효 충전 시간 = `_mChargeTime * chargeSpeedMult`) |
| `hasFireDisguise`   | `false` | 트랩 스플래시 + 30% 확률 화상 부여 여부 |
| `hasIceDisguise`    | `false` | 트랩 스플래시 + 30% 확률 빙결 부여 여부 |
| `hasPoisonDisguise` | `false` | 트랩 스플래시 + 30% 확률 중독 부여 여부 |
| `trapCostBonus` | `0` | 트랩 코어 소모 감소량 (실제 소모 = max(1, 3 - bonus)) |
| `trapSizeMult` | `1` | 트랩 크기 배율 |

---

## 상태이상 시스템 (`src/systems/EnemyManager.js`)

### 독 (poison)
- `_poisoned` Map — `{ timer: 10, accum: 0 }`
- 중첩 없음: 발동 확률 30% (hit당), 만료 후 재적용 가능
- 데미지: maxHp×1%/s, 최소 2/s
- 시각: HP바 보라색(`0xaa44ff`) → 만료 시 초록 복원

### 화상 (burn)
- `_burned` Map — `{ timer: 3, accum: 0 }`
- 중첩 없음: 발동 확률 30% (hit당), 만료 후 재적용 가능
- 데미지: maxHp×2.5%/s, 최소 4/s
- 시각: HP바 주황-빨강(`0xff4422`) → 만료 시 초록 복원, 데미지 숫자 `#ff6622`

### 빙결 (freeze)
- `_frozen` Map — `{ timer: 3 }`
- 중첩 없음: 발동 확률 30% (hit당), 만료 후 재발동 가능
- 효과: 매 프레임 velocity 강제 0 (이동 완전 불가)
- 시각: HP바 하늘색(`0x88ccff`) → 만료 시 초록 복원

---

## 아이템 추가 시 체크리스트

1. `src/entities/PassiveItem.js` — `ITEM_DEFS`에 항목 추가 (id, name, color, apply)
2. `src/entities/Player.js` — 필요한 스탯 프로퍼티 추가 (기본값 포함)
3. 효과 적용 코드 — `AttackManager.js` 또는 `EnemyManager.js`에 배율/플래그 반영
4. `src/scenes/GameScene.js` — 아이템 추가 시 별도 작업 불필요 (`Object.keys(ITEM_DEFS)`로 자동 포함)
5. **이 파일(ITEMS.md) 갱신**
