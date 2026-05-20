# LAGOMORPH 타일 이미지 디자인 요청

## 현재 상태

바닥 타일은 `BootScene._generateTextures()`에서 코드로 생성 중.  
실제 PNG로 교체하면 시각 퀄리티가 크게 향상됨.

---

## 타일 스펙

| 키 | 파일명 | 크기 | 빈도 | 설명 |
|---|---|---|---|---|
| `tile_floor` | `tile_floor.png` | 40×40 | 45% | 기본 석재 바닥 |
| `tile_floor_b` | `tile_floor_b.png` | 40×40 | 40% | 약간 밝은 변형 |
| `tile_crack` | `tile_crack.png` | 40×40 | 10% | 균열 있는 바닥 |
| `tile_moss` | `tile_moss.png` | 40×40 | 5% | 이끼 낀 바닥 |

- 저장 위치: `public/assets/tiles/`
- 포맷: PNG, 배경 불투명 (바닥 타일은 투명 배경 불필요)
- 색상 기준: 어두운 남색 계열 (`#12121e` ~ `#15152a`)

---

## 공통 스타일 지시문

```
Pixel art floor tile, 40x40 px, seamlessly tileable (edge-to-edge match).
Top-down view, dark dungeon aesthetic.
Base color: very dark navy-black (#12121e to #15152a range).
Subtle 1px border/grid line on edges (darker shade, ~#1c1c2c).
No anti-aliasing, crisp pixel edges. Limited palette (4-6 colors max per tile).
Style: dark stone dungeon floor, sci-fi/fantasy hybrid.
```

---

## 개별 타일 요청 프롬프트

### tile_floor — 기본 석재 바닥

```
Pixel art floor tile, 40x40 px, seamlessly tileable.
Dark stone dungeon floor. Base fill: #12121e (very dark navy-black).
Subtle 1px border line on all edges: #1c1c2c.
Minimal texture: 2-3 faint stone grain lines running diagonally.
Top-down view, flat lighting. 4-color palette max. No anti-aliasing.
```

### tile_floor_b — 밝은 변형

```
Pixel art floor tile, 40x40 px, seamlessly tileable.
Slightly lighter variant of a dark stone dungeon floor. Base fill: #15152a.
Subtle 1px border line on all edges: #1c1c2c.
Minimal texture: 1-2 faint highlight pixels suggesting worn stone surface.
Top-down view, flat lighting. 4-color palette max. No anti-aliasing.
Must pair well visually with a tile of base color #12121e (same set).
```

### tile_crack — 균열 바닥

```
Pixel art floor tile, 40x40 px, seamlessly tileable.
Cracked dark stone dungeon floor. Base fill: #12121e.
Subtle 1px border: #1c1c2c.
A Y-shaped crack pattern: main crack runs from upper-left area to center,
then splits into two branches — one going lower-left, one going right.
Crack color: slightly lighter than base (#252535), 1px wide.
No glow, no fill inside crack. Top-down view. 5-color palette max. No anti-aliasing.
```

### tile_moss — 이끼 바닥

```
Pixel art floor tile, 40x40 px, seamlessly tileable.
Mossy dark stone dungeon floor. Base fill: #12121e.
Subtle 1px border: #1c1c2c.
5-6 small irregular moss patches scattered across the tile:
each patch is 3-5 px wide, 2-3 px tall, dark forest green (#1a301a to #1e3a1e).
Placed near corners and edges to feel organic. Top-down view. 5-color palette max.
No anti-aliasing.
```

---

## 벽 / 장애물 타일 (선택 추가)

현재 벽과 장애물은 단색 사각형(`0x3a3a5e`, `0x2a2a50`)으로 렌더링 중.  
아래는 나중에 추가 교체 시 쓸 프롬프트.

### tile_wall — 벽 텍스처 (틸링용 20×20)

```
Pixel art wall tile, 20x20 px, seamlessly tileable (vertical and horizontal).
Dark dungeon stone wall. Base color: #3a3a5e (dark blue-gray).
Brick/block pattern: horizontal mortar lines every 8px, offset every other row.
Mortar color: #2a2a4e (darker). Stone face color: #3e3e66 (slightly lighter highlight).
Top-down perspective wall face. 4-color palette max. No anti-aliasing.
```

### tile_obstacle — 장애물 바위 텍스처 (틸링용 24×24)

```
Pixel art rock/boulder tile, 24x24 px, seamlessly tileable.
Used as a dungeon obstacle texture. Base: #2a2a50 (dark navy).
Rough irregular stone surface with 2-3 highlight pixels on top-left edge (#3a3a66)
and 1-2 shadow pixels on bottom-right (#1e1e3e).
Top-down view, slightly 3D-looking chunk of rock. 5-color palette max. No anti-aliasing.
```

---

## AI 툴별 사용 팁

- **Midjourney**: 각 프롬프트 뒤에 `--ar 1:1 --style raw --v 6 --tile` 추가  
  (`--tile` 옵션이 seamless tiling을 자동 적용)
- **DALL-E / ChatGPT**: "다음 타일 4개를 하나씩 순서대로 만들어줘" + 전체 블록
- **Stable Diffusion**: Negative prompt에 `blurry, anti-aliased, realistic, 3D, gradient` 추가

---

## PNG 교체 방법 (메모)

> 실제 이미지가 준비됐을 때 아래 절차대로 교체

### 1단계 — 파일 배치

```
public/
└── assets/
    └── tiles/
        ├── tile_floor.png
        ├── tile_floor_b.png
        ├── tile_crack.png
        └── tile_moss.png
```

### 2단계 — BootScene.js 수정

**preload()에 로드 코드 추가** (소마 스프라이트 로드 바로 아래):

```js
// preload() 안에 추가
['tile_floor', 'tile_floor_b', 'tile_crack', 'tile_moss'].forEach(
  key => this.load.image(key, `assets/tiles/${key}.png`)
);
```

**_generateTextures()에서 타일 생성 코드 삭제**:

```js
// 아래 블록 전체 삭제 (tile_floor ~ tile_moss 4개 항목)
const T = 40;
// tile_floor — 기본 석재 바닥
// ... (tile_moss까지 4개 블록 모두 제거)
```

### 3단계 — Room.js는 수정 불필요

`Room._buildFloor()`는 `'tile_floor'` 같은 **키 이름**으로만 참조하므로  
텍스처가 preload()에서 로드되면 자동으로 PNG를 사용함.

### 확인 포인트

- 타일 크기가 정확히 **40×40 px**인지 확인 (다른 크기면 Room.js의 `T = 40` 상수 조정)
- `npm run dev` 후 바닥이 의도한 이미지로 표시되는지 확인
- 방 전환 시 새 방에서도 타일이 올바르게 렌더링되는지 확인
