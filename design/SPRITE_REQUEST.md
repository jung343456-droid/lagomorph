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

## Claude에게 한 번에 요청하는 방법

Claude는 이미지를 직접 생성하지 않으므로, **한 번에 프롬프트 7개를 Midjourney·DALL-E·Stable Diffusion에 제출할 수 있도록 정리된 배치 파일**을 요청하는 것이 효율적입니다.

**추천 방식:**
1. 위 개별 캐릭터 섹션의 영문 프롬프트 블록을 그대로 복사
2. Midjourney: `/imagine` 명령에 각 프롬프트 + `--ar 1:1 --style raw --v 6` 추가
3. DALL-E(ChatGPT): "다음 스프라이트 7개를 하나씩 순서대로 만들어줘" + 전체 블록 붙여넣기
4. Stable Diffusion: 공통 스타일 지시문을 **Negative Prompt**에 `anti-aliasing, blurry, realistic, 3D` 추가

> **팁**: Midjourney에서 `--tile` 옵션을 쓰면 같은 캐릭터의 여러 프레임을 하나의 스프라이트 시트로 받을 수 있습니다.
