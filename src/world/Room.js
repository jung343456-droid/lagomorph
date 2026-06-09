import { GAME_W, GAME_H, HUD_H, zoneOf } from '../constants';

export const ROOM_W = GAME_W;           // 방 너비 = 캔버스 너비
export const ROOM_H = GAME_H - HUD_H;  // 방 높이 = 게임플레이 뷰포트 높이 (스크롤 없음)
export const WALL_T = 20;   // 벽 두께 (px)
export const DOOR_W = 80;   // 문 통로 너비 (px) — 플레이어 body(55×53) 가 여유롭게 통과하도록 80

// 구역 3·4(층 11~20) 보라톤 — BootScene 가 hue-rotate 로 만든 '_p' 텍스처를 _tex()로 선택(새 에셋 없음).

const WALL_COLOR     = 0x3a3a5e; // 벽 색상 (진한 남색)
const OBSTACLE_COLOR = 0x2a2a50; // 장애물 색상
const DOOR_LOCKED    = 0x111133; // 잠긴 문 블록 색상
const DOOR_OPEN_HINT = 0x1e1e3a; // 열린 문 어두운 배경 색상

// 수평 문 X 시작 / 수직 문 Y 시작
export const DOOR_HX = (ROOM_W - DOOR_W) / 2;   // 수평 문(상·하) 좌측 x 좌표 (= 165)
export const DOOR_VY = (ROOM_H - DOOR_W) / 2;   // 수직 문(좌·우) 상단 y 좌표 (= 392)

export default class Room {
  constructor(scene, data, floorNum = 1) {
    this.scene = scene;
    this.data  = data;
    this._purple = zoneOf(floorNum) >= 3;  // 구역 3·4 → 보라톤 틴트

    this.wallGroup      = scene.physics.add.staticGroup();
    this.obstacleGroup  = scene.physics.add.staticGroup();
    this._doorBlocks    = {};  // dir → rect
    this._gfx           = [];  // 비물리 시각 오브젝트

    this._buildFloor();
    this._buildWalls();
    this._buildObstacles();
    if (data.type === 'shop') this._buildShopAmbience();
  }

  /** 전투방 진입 시 모든 연결 문을 물리 블록으로 막음 */
  lockDoors() {
    Object.entries(this.data.doors).forEach(([dir, nid]) => {
      if (nid === null || this._doorBlocks[dir]) return;
      const a = this._doorArea(dir);
      // 벽과 동일한 fence 텍스처로 채워 zone 톤과 자연스럽게 이어지게 한다.
      const block = this.scene.add.tileSprite(a.cx, a.cy, a.w, a.h, this._tex('obstacle_fence'));
      block.setDepth(3);
      this.scene.physics.add.existing(block, true);
      this.wallGroup.add(block);
      this._doorBlocks[dir] = block;
    });
  }

  /** 방 클리어 시 문 잠금 해제 + 시각 힌트 추가 */
  unlockDoors() {
    Object.values(this._doorBlocks).forEach(block => {
      if (block.body) block.body.enable = false;
      block.setVisible(false);
    });
    this._doorBlocks = {};
    this._drawOpenDoorHints();
  }

  /**
   * 드롭 좌표가 장애물 안인지 확인하고, 안이면 8방향으로 점진적으로 밀어내 가장 가까운 빈 위치를 반환.
   * 못 찾으면 입력값 그대로 (드롭은 발생, 다만 줍기 어려울 수 있음).
   */
  findSafeDropPos(x, y) {
    const obstacles = this.obstacleGroup.getChildren();
    const blocked = (px, py) => obstacles.some(o => {
      if (!o.body) return false;
      const b = o.body;
      return px >= b.x && px <= b.x + b.width
          && py >= b.y && py <= b.y + b.height;
    });
    if (!blocked(x, y)) return { x, y };
    const STEP = 12, MAX_R = 96;
    for (let r = STEP; r <= MAX_R; r += STEP) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const nx = x + Math.cos(a) * r;
        const ny = y + Math.sin(a) * r;
        if (!blocked(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  destroyObstacle(go) {
    if (!go?.active) return;
    if (this.data.obstacleLayout) {
      const idx = this.data.obstacleLayout.findIndex(
        o => Math.abs(o.x - go.x) < 1 && Math.abs(o.y - go.y) < 1,
      );
      if (idx !== -1) this.data.obstacleLayout.splice(idx, 1);
    }
    this.obstacleGroup.remove(go, true, true);
    const idx = this._gfx.indexOf(go);
    if (idx !== -1) this._gfx.splice(idx, 1);
  }

  destroy() {
    this.wallGroup.destroy(true);
    this.obstacleGroup.destroy(true);
    this._gfx.forEach(g => { if (g?.active) g.destroy(); });
  }

  // ── private ─────────────────────────────────────────

  /** 구역 3·4 방이면 '_p'(보라톤) 텍스처 키로 치환 (BootScene 가 hue-rotate 로 생성) */
  _tex(key) {
    return this._purple ? `${key}_p` : key;
  }

  _buildFloor() {
    const T = 40;
    // 가중치: grass_floor 50%, grass_floor_b 35%, grass_floor_flowers 10%, grass_floor_path 5%
    const POOL = [
      'grass_floor','grass_floor','grass_floor','grass_floor','grass_floor',
      'grass_floor','grass_floor','grass_floor','grass_floor','grass_floor',
      'grass_floor_b','grass_floor_b','grass_floor_b','grass_floor_b',
      'grass_floor_b','grass_floor_b','grass_floor_b',
      'grass_floor_flowers','grass_floor_flowers',
      'grass_floor_path',
    ];
    // zone-1 타일은 좌·상단이 의도적으로 어두운 음영이므로 회전·플립을 적용하면
    // 인접 타일의 어두운 가장자리가 마주쳐 검은 격자선이 도드라진다. 그대로 둔다.
    for (let row = 0; row * T < ROOM_H; row++) {
      for (let col = 0; col * T < ROOM_W; col++) {
        const key = this._tex(POOL[Math.floor(Math.random() * POOL.length)]);
        const img = this.scene.add.image(col * T + T / 2, row * T + T / 2, key).setDepth(0);
        this._gfx.push(img);
      }
    }
  }

  _buildWalls() {
    const { doors } = this.data;
    const add = (x1, y1, x2, y2) => {
      const w = x2 - x1, h = y2 - y1;
      const sprite = this.scene.add.tileSprite(x1 + w / 2, y1 + h / 2, w, h, this._tex('obstacle_fence'));
      sprite.setDepth(2);
      this.scene.physics.add.existing(sprite, true);
      this.wallGroup.add(sprite);
      this._gfx.push(sprite);
    };

    // 상단
    if (doors.up !== null) {
      add(0, 0, DOOR_HX, WALL_T);
      add(DOOR_HX + DOOR_W, 0, ROOM_W, WALL_T);
    } else { add(0, 0, ROOM_W, WALL_T); }

    // 하단
    if (doors.down !== null) {
      add(0, ROOM_H - WALL_T, DOOR_HX, ROOM_H);
      add(DOOR_HX + DOOR_W, ROOM_H - WALL_T, ROOM_W, ROOM_H);
    } else { add(0, ROOM_H - WALL_T, ROOM_W, ROOM_H); }

    // 좌측
    if (doors.left !== null) {
      add(0, 0, WALL_T, DOOR_VY);
      add(0, DOOR_VY + DOOR_W, WALL_T, ROOM_H);
    } else { add(0, 0, WALL_T, ROOM_H); }

    // 우측
    if (doors.right !== null) {
      add(ROOM_W - WALL_T, 0, ROOM_W, DOOR_VY);
      add(ROOM_W - WALL_T, DOOR_VY + DOOR_W, ROOM_W, ROOM_H);
    } else { add(ROOM_W - WALL_T, 0, ROOM_W, ROOM_H); }
  }

  _buildObstacles() {
    // 상점방·시작방: 장애물 없음
    //  - 상점: NPC·구매 동선 방해 방지
    //  - 시작방: 플레이어 등장 지점(중앙·문 근처)에 장애물이 겹쳐 stuck 되는 사고 방지
    if (this.data.type === 'shop' || this.data.type === 'start') {
      this.data.obstacleLayout = [];
      return;
    }

    // zone-1 장애물 종류: tree(40×56) / bush(24×24) / stump(24×20)
    // 같은 텍스처를 tileSprite로 겹쳐 쌓는 대신, 종류·스케일을 무작위로 골라 다양성 확보.
    const TYPES = {
      tree:  { key: 'obstacle_tree',  w: 40, h: 56, minS: 0.9, maxS: 1.3, weight: 2 },
      bush:  { key: 'obstacle_bush',  w: 24, h: 24, minS: 0.9, maxS: 1.5, weight: 3 },
      stump: { key: 'obstacle_stump', w: 24, h: 20, minS: 0.9, maxS: 1.4, weight: 2 },
    };
    const POOL = [];
    Object.entries(TYPES).forEach(([t, def]) => {
      for (let i = 0; i < def.weight; i++) POOL.push(t);
    });

    // 문 통로 keep-out 영역 — 활성화된 출입구 안쪽에 장애물이 들어가지 않도록
    const DOOR_PAD   = 12;   // 통로 좌우 여유 (문 폭 80 → 104px 통과 폭)
    const DOOR_CLEAR = 90;   // 통로 진입 깊이
    const keepouts = [];
    const { doors } = this.data;
    if (doors.up !== null)    keepouts.push({ x: DOOR_HX - DOOR_PAD, y: 0,                    w: DOOR_W + 2 * DOOR_PAD, h: DOOR_CLEAR });
    if (doors.down !== null)  keepouts.push({ x: DOOR_HX - DOOR_PAD, y: ROOM_H - DOOR_CLEAR,  w: DOOR_W + 2 * DOOR_PAD, h: DOOR_CLEAR });
    if (doors.left !== null)  keepouts.push({ x: 0,                  y: DOOR_VY - DOOR_PAD,   w: DOOR_CLEAR,            h: DOOR_W + 2 * DOOR_PAD });
    if (doors.right !== null) keepouts.push({ x: ROOM_W - DOOR_CLEAR, y: DOOR_VY - DOOR_PAD,  w: DOOR_CLEAR,            h: DOOR_W + 2 * DOOR_PAD });
    const blocksDoor = (x, y, dw, dh) => {
      const ox1 = x - dw / 2, oy1 = y - dh / 2, ox2 = x + dw / 2, oy2 = y + dh / 2;
      return keepouts.some(k => ox1 < k.x + k.w && ox2 > k.x && oy1 < k.y + k.h && oy2 > k.y);
    };

    if (!this.data.obstacleLayout) {
      const margin = 40;
      const count  = 2 + Math.floor(Math.random() * 3);  // 2~4
      const MAX_TRY = 30;
      this.data.obstacleLayout = [];
      for (let i = 0; i < count; i++) {
        const type  = POOL[Math.floor(Math.random() * POOL.length)];
        const def   = TYPES[type];
        const scale = def.minS + Math.random() * (def.maxS - def.minS);
        const dw = def.w * scale, dh = def.h * scale;
        const minX = WALL_T + margin + dw / 2;
        const maxX = ROOM_W - WALL_T - margin - dw / 2;
        const minY = WALL_T + margin + dh / 2;
        const maxY = ROOM_H - WALL_T - margin - dh / 2;
        let placed = false;
        for (let t = 0; t < MAX_TRY && !placed; t++) {
          const x = minX + Math.random() * (maxX - minX);
          const y = minY + Math.random() * (maxY - minY);
          if (blocksDoor(x, y, dw, dh)) continue;
          this.data.obstacleLayout.push({ x, y, type, scale });
          placed = true;
        }
        // MAX_TRY 안에 자리를 못 찾으면 이 장애물은 스킵 (개수가 1~2개 적어질 수 있음)
      }
    } else {
      // 기존 저장된 레이아웃에서도 문 통로 막는 장애물은 제거 (구버전 호환)
      this.data.obstacleLayout = this.data.obstacleLayout.filter(o => {
        const def = TYPES[o.type] || TYPES.bush;
        const s   = o.scale ?? (o.w && o.h ? Math.max(o.w / def.w, o.h / def.h) : 1);
        return !blocksDoor(o.x, o.y, def.w * s, def.h * s);
      });
    }

    this.data.obstacleLayout.forEach(({ x, y, type, scale, w, h }) => {
      // 구 포맷({x,y,w,h}) 호환: type이 없으면 bush 로 폴백
      const def = TYPES[type] || TYPES.bush;
      const s   = scale ?? (w && h ? Math.max(w / def.w, h / def.h) : 1);
      const obs = this.scene.add.image(x, y, this._tex(def.key)).setDepth(2).setScale(s);
      this.scene.physics.add.existing(obs, true);
      this.obstacleGroup.add(obs);
      this._gfx.push(obs);
    });
  }

  _drawOpenDoorHints() {
    const hints = [
      { dir: 'up',    x: ROOM_W / 2,         y: WALL_T / 2 },
      { dir: 'down',  x: ROOM_W / 2,         y: ROOM_H - WALL_T / 2 },
      { dir: 'left',  x: WALL_T / 2,         y: ROOM_H / 2 },
      { dir: 'right', x: ROOM_W - WALL_T / 2, y: ROOM_H / 2 },
    ];
    const arrowChar = { up: '▲', down: '▼', left: '◀', right: '▶' };

    hints.forEach(({ dir, x, y }) => {
      if (this.data.doors[dir] == null) return;
      const t = this.scene.add.text(x, y, arrowChar[dir], {
        fontSize: '12px', color: '#4ecca3', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(5);
      this._gfx.push(t);
    });
  }

  /** 상점방 한정: 따뜻한 톤 오버레이 (원형 글로우는 상호작용 범위로 오인되어 제거) */
  _buildShopAmbience() {
    const overlay = this.scene.add.rectangle(
      ROOM_W / 2, ROOM_H / 2, ROOM_W, ROOM_H, 0x3a2818, 0.22,
    ).setDepth(0.5);
    this._gfx.push(overlay);
  }

  /** 문 블록의 물리 영역 (center-x, center-y, width, height) */
  _doorArea(dir) {
    switch (dir) {
      case 'up':    return { cx: ROOM_W/2,          cy: WALL_T/2,          w: DOOR_W, h: WALL_T };
      case 'down':  return { cx: ROOM_W/2,          cy: ROOM_H - WALL_T/2, w: DOOR_W, h: WALL_T };
      case 'left':  return { cx: WALL_T/2,          cy: ROOM_H/2,          w: WALL_T, h: DOOR_W };
      case 'right': return { cx: ROOM_W - WALL_T/2, cy: ROOM_H/2,          w: WALL_T, h: DOOR_W };
    }
  }
}
