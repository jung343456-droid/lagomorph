# LAGOMORPH 적 캐릭터 스프라이트 디자인 요청

## 게임 컨텍스트

**LAGOMORPH**는 Phaser 3 탑다운 로그라이크입니다.  
- 배경: 황폐화된 숲 던전, 어두운 톤  
- 주인공: 사이버네틱 강화 토끼 **VOSS-7 (soma)** — 전투용 보호대와 바이저를 장착한 군사 개조체  
- 적: 변이/야생화된 삼림 동물들 — 눈이 붉게 빛나거나 사이버 임플란트 흔적이 있음  
- 아트 스타일: **16×16 기반 픽셀 아트**, 탑다운 45° 쿼터뷰, 배경 투명(PNG), 색상 팔레트 제한(캐릭터당 8~12색)

---

## 일괄 요청 프롬프트 (Claude / Midjourney / DALL-E 공용)

아래 블록 전체를 한 번에 붙여넣으면 7종을 한 요청으로 처리할 수 있습니다.

---

### ✦ 공통 스타일 지시문 (모든 요청에 앞에 추가)

```
Pixel art sprite sheet for a top-down roguelike game called LAGOMORPH.
Style: 16x16 base pixel art, top-down 45-degree quarter-view, transparent PNG background,
limited palette (8-12 colors per character), dark forest dungeon aesthetic.
All enemies are mutated/corrupted forest animals with glowing red eyes or subtle cybernetic implants.
Clean pixel art, no anti-aliasing, crisp edges.
```

---

## 개별 캐릭터 요청

### 1. 여우 (Fox) — 추격형
- **게임 내 크기**: 28×28 px  
- **기준 색상**: `#E8600E` (주황)  
- **특징**: 날렵한 체형, 긴 꼬리, 붉은 눈, 앞발을 앞으로 내밀고 달리는 자세  
- **상태 스프라이트 2장**: 기본(idle), 달리기(run/chase)

```
Pixel art sprite, 28x28 px, transparent background.
A mutated fox enemy for a top-down roguelike dungeon crawler.
Orange fur (#E8600E), glowing red eyes, sleek body, long tail.
Two frames on one sheet side by side: [idle] standing alert, [chase] mid-run leaning forward.
Top-down 45-degree angle view. Dark dungeon aesthetic. 8-color limited palette.
```

---

### 2. 들쥐 (Rat) — 돌진형
- **게임 내 크기**: 14×14 px  
- **기준 색상**: `#888866` (올리브 회색)  
- **특징**: 작고 뭉툭한 체형, 긴 꼬리, 이빨 드러낸 공격 자세, 3마리 무리로 등장  
- **상태 스프라이트 2장**: 기본(idle), 돌진(rush)  

```
Pixel art sprite, 14x14 px, transparent background.
A mutated rat enemy for a top-down roguelike dungeon crawler.
Olive gray fur (#888866), glowing red eyes, stubby round body, long thin tail.
Two frames on one sheet side by side: [idle] crouched alert, [rush] charging forward baring teeth.
Top-down 45-degree angle view. Small and fast-looking. 8-color limited palette.
```

---

### 3. 족제비 (Weasel) — 기습형
- **게임 내 크기**: 16×26 px (세로로 긴 체형)  
- **기준 색상**: `#CCAA55` (황갈색)  
- **특징**: 길고 가느다란 몸, 대시 중 몸이 황금빛(`#FFDD88`)으로 빛남, 민첩한 자세  
- **상태 스프라이트 3장**: 기본(idle), 접근(approach), 대시(dash — 황금빛 잔상)

```
Pixel art sprite, 16x26 px (tall narrow body), transparent background.
A mutated weasel enemy for a top-down roguelike dungeon crawler.
Tan-golden fur (#CCAA55), glowing red eyes, long slender body.
Three frames on one sheet side by side: [idle] coiled ready, [approach] low-crouched stalk,
[dash] lunging forward with golden glow (#FFDD88) trail effect.
Top-down 45-degree angle view. 8-color limited palette.
```

---

### 4. 고슴도치 (Hedgehog) — 방어형
- **게임 내 크기**: 26×26 px  
- **기준 색상**: `#556633` (올리브 녹색)  
- **특징**: 뭉툭하고 단단한 체형, 가시가 빽빽하게 돋아남, 가시 공격 시 전신이 노랑-초록(`#DDFF44`)으로 빛남  
- **상태 스프라이트 2장**: 기본(idle/chase), 가시 공격(spike — 빛남 + AoE 원형 테두리 힌트)

```
Pixel art sprite, 26x26 px, transparent background.
A mutated hedgehog enemy for a top-down roguelike dungeon crawler.
Olive green body (#556633), glowing red eyes, dense sharp spines covering back.
Two frames on one sheet side by side: [idle] compact walking form,
[spike] puffed up with all spines extended, body glowing yellow-green (#DDFF44).
Top-down 45-degree angle view. Chunky defensive silhouette. 8-color limited palette.
```

---

### 5. 다람쥐 (Squirrel) — 원거리형
- **게임 내 크기**: 16×20 px  
- **기준 색상**: `#CC7722` (주황 갈색)  
- **특징**: 큰 꼬리, 도토리를 손에 들고 던지는 자세, 원거리 공격형이라 경계하는 눈빛  
- **상태 스프라이트 2장**: 기본(idle), 투척(throw — 팔을 들어 도토리 던지는 자세)  
- **도토리 투사체 1장**: 8×8 px, 진한 갈색(`#885522`)

```
Pixel art sprite sheet, transparent background.
A mutated squirrel enemy for a top-down roguelike dungeon crawler.
Orange-brown fur (#CC7722), glowing red eyes, large bushy tail, small body (16x20 px).
Three frames on one sheet side by side: [idle 16x20] alert lookout pose,
[throw 16x20] arm raised hurling an acorn, [acorn projectile 8x8] dark brown (#885522) spinning acorn.
Top-down 45-degree angle view. 8-color limited palette.
```

---

### 6. 늑대 (Wolf) — 엘리트 보스
- **게임 내 크기**: 32×36 px  
- **기준 색상**: `#445544` (회록색), 포효 시 `#AABBAA` (밝은 회록)  
- **특징**: 위협적인 체구, 날카로운 눈, 포효 시 입을 크게 벌림, 오라 효과(주변 적에게 푸른빛 가속 아우라)  
- **상태 스프라이트 3장**: 기본(idle/chase), 포효(howl — 입 열림, 밝아짐), 오라 힌트(glow ring 있는 버전)

```
Pixel art sprite sheet, transparent background.
An elite mutated wolf boss enemy for a top-down roguelike dungeon crawler.
Large imposing body (32x36 px), dark olive-green fur (#445544), glowing red eyes,
scarred muzzle, muscular frame.
Three frames on one sheet side by side:
[chase 32x36] menacing forward stalk,
[howl 32x36] head raised, mouth wide open, body brightens to #AABBAA,
[aura 32x36] same as chase but with a subtle green-blue glow ring around feet.
Top-down 45-degree angle view. Boss-tier presence. 10-color limited palette.
```

---

### 7. Fang — 최종 보스
- **게임 내 크기**: 64×64 px  
- **기준 색상**: `#8B0000` (암적색), 분노 2페이즈 `#CC2200` (분노 적색)  
- **특징**: 매우 큰 체구(적의 2배), 강철 같은 가죽, 거대한 발톱, 1페이즈 침착/위협적, 2페이즈 분노하여 몸 전체가 빨간 빛  
- **상태 스프라이트 4장**: 기본(chase), 돌진(dash), 발 구름(stomp — 앞발 들어 올림), 2페이즈(rage — 전신 발광)

```
Pixel art sprite sheet, transparent background.
FANG, the final boss of a top-down roguelike dungeon crawler. A massive mutated beast (64x64 px).
Dark blood-red armored hide (#8B0000), piercing white eyes, enormous claws, scarred battle-worn body.
Four frames on one sheet side by side:
[chase 64x64] slow menacing advance,
[dash 64x64] body stretched forward in high-speed lunge,
[stomp 64x64] front legs raised high about to slam down,
[rage 64x64] entire body radiating intense red-orange glow (#CC2200), veins visible.
Top-down 45-degree angle view. Enormous imposing silhouette dwarfing all other enemies.
10-12 color limited palette.
```

---

## 플레이어 — VOSS-7 (soma) 추가 방향 스프라이트

현재 8방향 스프라이트 존재 (`public/assets/characters/soma-{direction}.png`).  
게임 내 표시 크기: **64×72 px**

```
Pixel art sprite sheet, transparent background.
VOSS-7 (codename: soma), a cybernetically enhanced combat rabbit soldier (64x72 px each frame).
White-gray fur, tactical armor plating on shoulders and chest, red visor/monocle over left eye,
military gear, cybernetic arm implants, battle-worn.
8 directional sprites on one sheet (2x4 grid, each 64x72 px):
[N] [NE] [E] [SE] [S] [SW] [W] [NW]
Each direction shows idle/walk pose appropriate for top-down 45-degree view.
Limited palette (12 colors), clean pixel art, sci-fi military aesthetic.
```

---

## 기술 요건 요약

| 항목 | 값 |
|---|---|
| 포맷 | PNG, 배경 투명 |
| 아트 스타일 | 픽셀 아트, 안티에일리어싱 없음 |
| 팔레트 | 캐릭터당 8~12색 |
| 뷰앵글 | 탑다운 45° 쿼터뷰 |
| 스케일 | 게임 내 크기 기준 (또는 2× — 각 캐릭터 스펙 참고) |
| 저장 위치 | `public/assets/characters/` (플레이어), `public/assets/enemies/` (적) |
| 파일명 규칙 | `{영문소문자}-{상태}.png` (예: `fox-idle.png`, `wolf-howl.png`) |

---

# ✦ 구역 2 — "더 깊은 숲" 적 캐릭터 추가 요청 (2025-11)

## 구역 2 컨텍스트

1구역(풀숲)에서 2구역으로 진입하면 **더 깊고 어두운 숲**으로 들어간다. 배경 타일은 1구역과 동일하지만, 등장 적들은:

- **야행성·대형 포식자** 위주 — 박쥐·멧돼지·거미·곰·두꺼비
- **상태이상 메커닉 도입** — 슬로우(거미줄), 독 DoT(두꺼비 웅덩이)
- **공중 강하형 보스 신규** — 부엉이왕(OWL KING)이 지상 돌진형 FANG과 대비

**시각적 연속성** — 1구역과 동일한 "변이/사이버 흔적 + 붉은 눈" 미감 유지하되, **체구가 더 크고 그림자가 짙은** 느낌으로. 모든 적은 1구역 동일한 톤이지만 위협감이 한 단계 증폭.

> **공통 스타일 지시문(아래 모든 프롬프트에 prefix로 추가)**
>
> ```
> Pixel art sprite for a top-down roguelike game called LAGOMORPH (Zone 2 - "deeper forest").
> Style: 16x16-base pixel art, top-down 45-degree quarter-view, transparent PNG background,
> limited palette (8-12 colors per character), dark forest dungeon aesthetic.
> Zone 2 enemies are larger, more nocturnal, more menacing than Zone 1 — still mutated/corrupted
> forest creatures with glowing red eyes and subtle cybernetic implants, but with deeper-shadowed silhouettes.
> Clean pixel art, no anti-aliasing, crisp edges.
> ```

---

## 파일 구조 및 명명 규칙 (구역 2 공통)

| 항목 | 값 |
|---|---|
| 저장 위치 | `public/assets/enemies/{name}/` — 1구역과 동일 폴더 구조 |
| 디렉토리 7개 | `bat/`, `boar/`, `spider/`, `bear/`, `toad/`, `blackbear/`, `owlking/` |
| 파일명 규칙 | `{name}-{state}.png` — 8방향 키는 `{name}-{n,ne,e,se,s,sw,w,nw}.png` |
| 8방향 키 | `n` = 위 / `ne` = 우상 / `e` = 우 / `se` = 우하 / `s` = 아래 / `sw` = 좌하 / `w` = 좌 / `nw` = 좌상 |
| 액션 스프라이트 | 각 적의 상태 머신 (idle, charge, swoop 등) 1장씩 — 8방향 스프라이트를 액션 중 일시적으로 덮어씌움 |
| 스프라이트 크기 | **표시 크기 기준** (= 게임에서 `setDisplaySize` 호출하는 값) |

### 의뢰 시 권장 출력 포맷

각 적당 다음 두 시트를 받는 것이 가장 효율적입니다:
1. **8방향 시트 1장** — 2×4 그리드 (위 순서대로 `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`) → 분할해서 8개 PNG 저장
2. **액션 시트 1장** — 액션 프레임을 가로로 나열 → 분할해서 각 액션 PNG 저장

---

## 1. 박쥐 (Bat) — 공중 군집 정찰병

- **게임 내 크기**: 28×22 px (가로로 약간 긴 비행 실루엣)
- **기준 색상**: `#6655AA` (짙은 자보라), 강하 시 잔상 `#9988DD`
- **특징**: 작은 몸통 + 큰 펼친 날개. 박쥐답게 코·귀 큼. 붉은 눈. **3마리 묶음 스폰**되므로 시각적으로 외로워 보이지 않게 — 한 마리만 그려도 군집의 정찰병 인상을 줘야 함.
- **저장 위치**: `public/assets/enemies/bat/`
- **파일 목록 (총 10개)**:
  - `bat-n.png`, `bat-ne.png`, `bat-e.png`, `bat-se.png`, `bat-s.png`, `bat-sw.png`, `bat-w.png`, `bat-nw.png` — 각 28×22 px (8방향, 날개 펼침 자세)
  - `bat-idle.png` — 28×22 px (정지 호버, 날개 살짝 접음)
  - `bat-swoop.png` — 28×22 px (강하 — 날개 뒤로 접고 머리 앞으로, 잔상 효과 힌트)

```
Pixel art sprite sheet, transparent background.
A mutated bat enemy for Zone 2 "deeper forest" of LAGOMORPH roguelike.
Body 28x22 px each frame, dark purple-violet (#6655AA) wing membranes,
darker body, glowing red eyes, large ears, small fangs.
8-directional flying sprites in 2x4 grid (each 28x22 px), order:
[N up] [NE] [E right] [SE] [S down] [SW] [W left] [NW]
Wings spread mid-flight, top-down 45-degree view.
Plus 2 action frames side by side on a separate strip:
[idle 28x22] hovering still, wings partially folded.
[swoop 28x22] diving forward, wings swept back, motion blur trail in #9988DD.
8-color limited palette. Nocturnal cave-dweller silhouette.
```

---

## 2. 멧돼지 (Boar) — 중량 단일 돌격병

- **게임 내 크기**: 56×48 px (1구역 여우의 ~1.5배 — 단일 솔로 스폰이라 시각적 무게감 필요)
- **기준 색상**: `#886644` (따뜻한 갈색 = 거친 털), 어두운 갈기 `#4A3422`, 송곳니 `#EEDDBB`
- **특징**: 두꺼운 머리·짧은 다리·끝에 작게 말린 꼬리. 양쪽으로 휘어진 송곳니 두 개. 갈기는 등 위로 짧게 솟음. **돌격 중 장애물 파괴**가 핵심 정체성이라 "추진력"이 보이는 자세.
- **저장 위치**: `public/assets/enemies/boar/`
- **파일 목록 (총 11개)**:
  - `boar-{n,ne,e,se,s,sw,w,nw}.png` — 각 56×48 px (8방향, 보통 보행/접근 자세)
  - `boar-idle.png` — 56×48 px (정지, 머리 약간 숙임)
  - `boar-ready.png` — 56×48 px (예고: 앞발로 땅을 긁고 머리 숙임, 콧김 표현 가능)
  - `boar-charge.png` — 56×48 px (전속력 돌격: 머리 정면, 다리 뒤로 뻗음, 잔상)

```
Pixel art sprite sheet, transparent background.
A mutated wild boar enemy for Zone 2 "deeper forest" of LAGOMORPH roguelike (56x48 px).
Warm brown coarse fur (#886644), dark mane (#4A3422) along spine,
two curved ivory tusks (#EEDDBB), small red eyes, thick shoulders, short stubby legs.
8-directional walking sprites in 2x4 grid (each 56x48 px):
[N] [NE] [E] [SE] [S] [SW] [W] [NW]
Top-down 45-degree view, sturdy heavy silhouette.
Plus 3 action frames side by side on a separate strip:
[idle 56x48] standing alert, head slightly low.
[ready 56x48] front hoof pawing the ground, head down, breath/steam puff.
[charge 56x48] full-speed lunge — head forward, legs stretched back, motion blur trail.
10-color limited palette. Conveys mass and impact — should look like it could destroy obstacles.
```

---

## 3. 거미 (Spider) — 지역 차단형

- **게임 내 크기**: 36×36 px (정사각 — 다리 펼친 비율)
- **기준 색상**: `#333344` (거의 검정, 약간 푸른빛), 다리 끝 `#222233`, 눈 다발 `#FF4444` (붉은 작은 점 여러 개)
- **특징**: 위에서 본 거미 형태. 8개 다리를 사방으로 펼침. 작은 몸통 + 둥근 복부. **거미줄(독립 텍스처)** 별도 필요 — 게임 내에서는 코드로 그리지만 의뢰 시 PNG로 받으면 향후 교체 가능.
- **저장 위치**: `public/assets/enemies/spider/`
- **파일 목록 (총 10개 + 옵션 1개)**:
  - `spider-{n,ne,e,se,s,sw,w,nw}.png` — 각 36×36 px (8방향, 측면 이동 자세 — 다리 위상 약간씩 다름)
  - `spider-idle.png` — 36×36 px (정지, 다리 균형)
  - `spider-throw.png` — 36×36 px (거미줄 투척: 앞 두 다리 들어올림, 입에서 빛나는 거미줄 실)
  - *(옵션)* `spider-web.png` — 110×110 px (반경 55px 거미줄 패치 텍스처, 반투명 흰색 십자 + 동심원 패턴, 알파 0.4)

```
Pixel art sprite sheet, transparent background.
A mutated giant spider enemy for Zone 2 "deeper forest" of LAGOMORPH roguelike (36x36 px).
Near-black body (#333344) with subtle blue-purple tint, eight long jointed legs spread radially,
cluster of small glowing red eyes (#FF4444), bulbous abdomen, small fangs.
8-directional top-down sprites in 2x4 grid (each 36x36 px) — leg phases vary slightly per direction:
[N] [NE] [E] [SE] [S] [SW] [W] [NW]
Top-down 45-degree view, evenly symmetric arachnid silhouette.
Plus 2 action frames on a strip:
[idle 36x36] legs balanced, abdomen low.
[throw 36x36] front two legs raised, glowing white web strand from mouth.
Plus optional [web texture 110x110] semi-transparent white silk patch with radial cross
and concentric circles, soft alpha edges — for the slow-zone ground effect.
8-color limited palette.
```

---

## 4. 곰 (Bear) — 중량 탱커

- **게임 내 크기**: 60×56 px (1구역 고슴도치의 ~1.4배 — 가장 큰 일반 적)
- **기준 색상**: `#4A3A25` (어두운 갈색), 격노 시 `#884422` (붉은 갈색)
- **특징**: 거대한 어깨·짧은 귀·둔중한 사지. 정면 휘두르기(swipe)가 핵심 패턴이라 **앞발 강조**. HP 30% 이하 격노 시 전신 붉은빛 + 입에서 김. 등 뒤가 공격 사각지대인 점이 디자인 포인트(부채꼴 회피 가능).
- **저장 위치**: `public/assets/enemies/bear/`
- **파일 목록 (총 11개)**:
  - `bear-{n,ne,e,se,s,sw,w,nw}.png` — 각 60×56 px (8방향, 느린 보행 자세)
  - `bear-idle.png` — 60×56 px (정지, 머리 약간 들고 경계)
  - `bear-swipe.png` — 60×56 px (앞발 휘두름: 한쪽 발 크게 들어 정면으로 후려치는 순간)
  - `bear-rage.png` — 60×56 px (격노 형태: 전신 붉은빛 `#884422`, 입에서 김, 눈에서 더 강한 붉은빛)

```
Pixel art sprite sheet, transparent background.
A mutated huge bear enemy for Zone 2 "deeper forest" of LAGOMORPH roguelike (60x56 px).
Dark brown fur (#4A3A25), heavy shoulders, short round ears, glowing red eyes,
massive front paws with visible claws, broad chest, slow stride.
8-directional walking sprites in 2x4 grid (each 60x56 px):
[N] [NE] [E] [SE] [S] [SW] [W] [NW]
Top-down 45-degree view, bulky imposing silhouette.
Plus 3 action frames on a strip:
[idle 60x56] standing alert, head slightly raised.
[swipe 60x56] one front paw raised high, swinging forward in a strike — clear front-cone attack pose.
[rage 60x56] enraged form — body tinted red-brown (#884422), steam from mouth,
intensified red glow in eyes and along spine.
10-color limited palette. Conveys massive weight — the body should look hard to knock back.
```

---

## 5. 두꺼비 (Toad) — 독 원거리병

- **게임 내 크기**: 36×32 px (납작한 가로 비율)
- **기준 색상**: `#559933` (독초록), 등 점박이 `#88DD33` (밝은 독성 녹색), 배 `#AABB55`
- **특징**: 펑퍼짐한 둥근 몸·짧은 다리·큰 눈. 등에 독성 점박이. **거의 정지 상태**라 정적인 실루엣 강조. 침 발사 시 입을 크게 벌리고 목 부풀음.
- **저장 위치**: `public/assets/enemies/toad/`
- **파일 목록 (총 10개 + 옵션 1개)**:
  - `toad-{n,ne,e,se,s,sw,w,nw}.png` — 각 36×32 px (8방향, 살짝 다른 자세)
  - `toad-idle.png` — 36×32 px (정지, 눈 깜빡임 가능)
  - `toad-spit.png` — 36×32 px (목 부풀고 입 크게 벌림, 침 발사 직전 또는 직후)
  - *(옵션)* `toad-puddle.png` — 120×120 px (반경 60px 독 웅덩이 — 밝은 녹색 `#88DD33` 반투명 원, 표면에 작은 거품 4~5개)

```
Pixel art sprite sheet, transparent background.
A mutated toxic toad enemy for Zone 2 "deeper forest" of LAGOMORPH roguelike (36x32 px).
Poison-green back (#559933) with bright toxic green spots (#88DD33),
pale yellow-green belly (#AABB55), bulging glowing red eyes, wide mouth, squat round body.
8-directional sprites in 2x4 grid (each 36x32 px) — pose varies subtly per direction:
[N] [NE] [E] [SE] [S] [SW] [W] [NW]
Top-down 45-degree view, low-profile squat silhouette (mostly static).
Plus 2 action frames on a strip:
[idle 36x32] sitting still, eyes wide.
[spit 36x32] throat puffed up, mouth wide open mid-spit — glowing green acid blob about to launch.
Plus optional [puddle texture 120x120] bright toxic green (#88DD33) semi-transparent puddle
with 4-5 small bubbles on surface, soft alpha edges — for the poison DoT ground effect.
8-color limited palette.
```

---

## 6. 검은곰 (BlackBear) — 8층 중간 보스

- **게임 내 크기**: 88×88 px (정사각, 일반 적 곰의 ~1.5배 — 보스급 시각 무게)
- **기준 색상**: `#1A1A1A` (검정), 흉터·갈기 `#3A2A1A`, 오라 `#FF8866` (사망 시 영향 받는 적의 데미지 부스트 표현)
- **특징**: 일반 곰보다 훨씬 크고 어두움. **포효 시 멧돼지 2마리 소환**하므로 입이 크게 벌어지는 동작 + **데미지 오라** 시각화(반경 220px 붉은 빛). 1구역 늑대(Wolf)와 대응되는 엘리트 보스급 위엄.
- **저장 위치**: `public/assets/enemies/blackbear/`
- **파일 목록 (총 11개)**:
  - `blackbear-{n,ne,e,se,s,sw,w,nw}.png` — 각 88×88 px (8방향, 위협적인 보행 자세)
  - `blackbear-idle.png` — 88×88 px (정지 위협)
  - `blackbear-slam.png` — 88×88 px (양 앞발 들어 내리찍기 — 충격파 AoE 예고)
  - `blackbear-roar.png` — 88×88 px (입 크게 벌려 포효 — 멧돼지 소환 신호)

```
Pixel art sprite sheet, transparent background.
BLACKBEAR, mid-boss of Zone 2 "deeper forest" in LAGOMORPH roguelike (88x88 px).
Massive imposing black bear (#1A1A1A) with darker brown scars (#3A2A1A) along the spine and face,
piercing glowing red eyes, exaggerated claws and fangs, battle-scarred ear,
larger than any common enemy — boss-tier presence.
8-directional menacing sprites in 2x4 grid (each 88x88 px):
[N] [NE] [E] [SE] [S] [SW] [W] [NW]
Top-down 45-degree view.
Plus 3 action frames on a strip:
[idle 88x88] standing tall, threatening posture, head slightly down.
[slam 88x88] both front paws raised high, about to crash down — shockwave AoE windup.
[roar 88x88] head raised, mouth wide open in a deafening roar, faint red aura ring at feet (#FF8866)
suggesting damage-boost aura for nearby enemies.
10-12 color limited palette. Pure dread silhouette.
```

---

## 7. 부엉이왕 (OwlKing) — 10층 최종 보스

- **게임 내 크기**: 92×92 px (정사각, FANG급 보스 크기)
- **기준 색상**: 평상시 `#8B6F3D` (어둠 속 금갈색), 깃털 끝 `#D4A857` (밝은 황금), 가슴깃 `#5A4525`. 광폭화(Phase 3) 시 전신 `#FF6666` 적색 틴트.
- **특징**: **공중 강하형 보스 — FANG(지상 돌진)과 대비**. 큰 노란 눈·날개 펼침이 핵심. 강하 중 그림자 인디케이터를 떨어뜨림. 깃털 산탄, 비명 AoE, 흡인 회오리, 박쥐 소환 등 다양한 액션 보유.
- **저장 위치**: `public/assets/enemies/owlking/`
- **파일 목록 (총 13개)**:
  - `owlking-{n,ne,e,se,s,sw,w,nw}.png` — 각 92×92 px (8방향, 호버 자세 — 날개 펼침)
  - `owlking-idle.png` — 92×92 px (정지 호버, 위풍당당)
  - `owlking-dive.png` — 92×92 px (수직 강하: 날개 접고 머리 아래로, 발톱 펼침)
  - `owlking-screech.png` — 92×92 px (비명: 부리 크게 벌림, 깃털 곤두섬, 황금 빛)
  - `owlking-whirl.png` — 92×92 px (회오리 흡인: 날개 활짝 벌림, 주변에 깃털 4발 산개 힌트)
  - `owlking-rage.png` — 92×92 px (Phase 3 광폭화: 전신 적색 `#FF6666`, 눈에서 진한 붉은 빛, 깃털 헝클어짐)
  - `owlking-feather.png` — 16×16 px (깃털 투사체: 황금 깃 1개, 회전 가능한 가로형, 끝이 뾰족)

```
Pixel art sprite sheet, transparent background.
OWL KING, final boss of Zone 2 "deeper forest" in LAGOMORPH roguelike (92x92 px).
A massive nocturnal great horned owl — dark golden-brown plumage (#8B6F3D),
golden feather tips (#D4A857), darker chest barring (#5A4525),
huge round yellow eyes with intense glow, prominent ear tufts,
enormous wingspan with feather details, sharp talons.
This boss is AERIAL and contrasts with the ground-based FANG (Zone 1 boss).
8-directional flying hover sprites in 2x4 grid (each 92x92 px) — wings always spread:
[N] [NE] [E] [SE] [S] [SW] [W] [NW]
Top-down 45-degree view, regal predator silhouette.
Plus 5 action frames on a strip:
[idle 92x92] hovering in place, wings extended, regal stance.
[dive 92x92] vertical dive — wings folded back, head pointed down, talons out front.
[screech 92x92] beak wide open in a piercing screech, feathers bristled, golden energy aura.
[whirl 92x92] wings fully spread in a horizontal vortex pose, with 4 small feathers visible
around the body suggesting a feather burst.
[rage 92x92] Phase 3 enraged — entire body tinted red (#FF6666), eyes burning crimson,
feathers ragged and chaotic, threatening glow.
Plus a separate small frame: [feather projectile 16x16] single golden feather, pointed tip,
horizontal orientation (will be rotated in-engine), can be used as ranged attack projectile.
12-color limited palette. Conveys imperial menace, dwarfing all other enemies.
```

---

## 8. 의뢰 시 체크리스트 (구역 2)

- [ ] 7개 디렉토리 생성: `public/assets/enemies/{bat,boar,spider,bear,toad,blackbear,owlking}/`
- [ ] 디렉토리당 PNG 분할 저장 (8방향 + 액션 스프라이트)
- [ ] 파일명 소문자·하이픈 규칙 준수: `{name}-{state}.png`
- [ ] 모든 PNG **배경 투명**, 안티에일리어싱 없음
- [ ] 크기는 "표시 크기 기준" — 게임 내 `setDisplaySize` 와 일치
- [ ] 8방향 스프라이트는 같은 캐릭터의 회전 일관성 유지 (꼬리·머리 방향이 9시→3시 시계 회전)
- [ ] 액션 스프라이트는 8방향 스프라이트와 동일한 크기로 (덮어씌우기 가능)
- [ ] 모든 적 공통: **붉은 눈빛** + **약간의 사이버 임플란트 흔적** (1구역과 시각 연속성)
- [ ] 보스급(blackbear, owlking)은 일반 적 대비 시각적 위엄·체구 차이 명확히

### 작업 완료 후 코드 측 정리

PNG 배치 완료 시 `src/scenes/BootScene.js` 의 `PLACEHOLDER_MAP` 블록(현재 1구역 스프라이트로 매핑된 임시 코드)을 제거하고, 기존 1구역 적과 동일한 로딩 패턴으로 교체합니다:

```js
[
  // ... (기존 1구역 7종)
  { name: 'bat',       actions: ['idle', 'swoop'] },
  { name: 'boar',      actions: ['idle', 'ready', 'charge'] },
  { name: 'spider',    actions: ['idle', 'throw'] },
  { name: 'bear',      actions: ['idle', 'swipe', 'rage'] },
  { name: 'toad',      actions: ['idle', 'spit'] },
  { name: 'blackbear', actions: ['idle', 'slam', 'roar'] },
  { name: 'owlking',   actions: ['idle', 'dive', 'screech', 'whirl', 'rage'] },
].forEach(({ name, actions }) => {
  DIRS.forEach(d => this.load.image(`${name}-${d}`, `assets/enemies/${name}/${name}-${d}.png`));
  actions.forEach(a => this.load.image(`${name}-${a}`, `assets/enemies/${name}/${name}-${a}.png`));
});
this.load.image('owlking-feather', 'assets/enemies/owlking/owlking-feather.png');
```

---

## Claude에게 한 번에 요청하는 방법

Claude는 이미지를 직접 생성하지 않으므로, **한 번에 프롬프트 7개를 Midjourney·DALL-E·Stable Diffusion에 제출할 수 있도록 정리된 배치 파일**을 요청하는 것이 효율적입니다.

**추천 방식:**
1. 위 개별 캐릭터 섹션의 영문 프롬프트 블록을 그대로 복사
2. Midjourney: `/imagine` 명령에 각 프롬프트 + `--ar 1:1 --style raw --v 6` 추가
3. DALL-E(ChatGPT): "다음 스프라이트 7개를 하나씩 순서대로 만들어줘" + 전체 블록 붙여넣기
4. Stable Diffusion: 공통 스타일 지시문을 **Negative Prompt**에 `anti-aliasing, blurry, realistic, 3D` 추가

> **팁**: Midjourney에서 `--tile` 옵션을 쓰면 같은 캐릭터의 여러 프레임을 하나의 스프라이트 시트로 받을 수 있습니다.
