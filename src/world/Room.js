import { GAME_W, GAME_H, HUD_H } from '../constants';

export const ROOM_W = GAME_W;           // 방 너비 = 캔버스 너비
export const ROOM_H = GAME_H - HUD_H;  // 방 높이 = 게임플레이 뷰포트 높이 (스크롤 없음)
export const WALL_T = 20;   // 벽 두께 (px)
export const DOOR_W = 60;   // 문 통로 너비 (px)

const WALL_COLOR     = 0x3a3a5e; // 벽 색상 (진한 남색)
const OBSTACLE_COLOR = 0x2a2a50; // 장애물 색상
const DOOR_LOCKED    = 0x111133; // 잠긴 문 블록 색상
const DOOR_OPEN_HINT = 0x1e1e3a; // 열린 문 어두운 배경 색상

// 수평 문 X 시작 / 수직 문 Y 시작
export const DOOR_HX = (ROOM_W - DOOR_W) / 2;   // 수평 문(상·하) 좌측 x 좌표 (= 165)
export const DOOR_VY = (ROOM_H - DOOR_W) / 2;   // 수직 문(좌·우) 상단 y 좌표 (= 392)

export default class Room {
  constructor(scene, data) {
    this.scene = scene;
    this.data  = data;

    this.wallGroup      = scene.physics.add.staticGroup();
    this.obstacleGroup  = scene.physics.add.staticGroup();
    this._doorBlocks    = {};  // dir → rect
    this._gfx           = [];  // 비물리 시각 오브젝트

    this._buildFloor();
    this._buildWalls();
    this._buildObstacles();
  }

  /** 전투방 진입 시 모든 연결 문을 물리 블록으로 막음 */
  lockDoors() {
    Object.entries(this.data.doors).forEach(([dir, nid]) => {
      if (nid === null || this._doorBlocks[dir]) return;
      const a = this._doorArea(dir);
      const block = this.scene.add.rectangle(a.cx, a.cy, a.w, a.h, DOOR_LOCKED);
      block.setDepth(3);
      this.wallGroup.add(block);  // StaticGroup이 직접 body 생성
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

  _buildFloor() {
    const T = 40;
    // 가중치: tile_floor 45%, tile_floor_b 40%, tile_crack 10%, tile_moss 5%
    const POOL = [
      'tile_floor','tile_floor','tile_floor','tile_floor','tile_floor',
      'tile_floor','tile_floor','tile_floor','tile_floor',
      'tile_floor_b','tile_floor_b','tile_floor_b','tile_floor_b',
      'tile_floor_b','tile_floor_b','tile_floor_b','tile_floor_b',
      'tile_crack','tile_crack',
      'tile_moss',
    ];
    for (let row = 0; row * T < ROOM_H; row++) {
      for (let col = 0; col * T < ROOM_W; col++) {
        const key = POOL[Math.floor(Math.random() * POOL.length)];
        const img = this.scene.add.image(col * T + T / 2, row * T + T / 2, key).setDepth(0);
        // 같은 텍스처라도 회전·플립으로 8가지 변형 → 격자감 분산
        img.setAngle(Math.floor(Math.random() * 4) * 90);
        if (Math.random() < 0.5) img.setFlipX(true);
        if (Math.random() < 0.5) img.setFlipY(true);
        this._gfx.push(img);
      }
    }
  }

  _buildWalls() {
    const { doors } = this.data;
    const add = (x1, y1, x2, y2) => {
      const w = x2 - x1, h = y2 - y1;
      const sprite = this.scene.add.tileSprite(x1 + w / 2, y1 + h / 2, w, h, 'tile_wall');
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
    if (!this.data.obstacleLayout) {
      const count = 1 + Math.floor(Math.random() * 3);
      const minX  = WALL_T + 50;
      const minY  = WALL_T + 50;
      const maxX  = ROOM_W - WALL_T - 50;
      const maxY  = ROOM_H - WALL_T - 50;
      this.data.obstacleLayout = [];
      for (let i = 0; i < count; i++) {
        const w = 36 + Math.floor(Math.random() * 44);
        const h = 36 + Math.floor(Math.random() * 44);
        const x = minX + Math.random() * (maxX - minX - w) + w / 2;
        const y = minY + Math.random() * (maxY - minY - h) + h / 2;
        this.data.obstacleLayout.push({ x, y, w, h });
      }
    }

    this.data.obstacleLayout.forEach(({ x, y, w, h }) => {
      const obs = this.scene.add.tileSprite(x, y, w, h, 'tile_obstacle');
      obs.setDepth(2);
      // tileSprite를 staticGroup에 그냥 add하면 텍스처 프레임(24×24) 크기로 body 생성됨.
      // 명시적으로 정적 body를 만들어 displayWidth/Height에 맞춤.
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
      if (this.data.doors[dir] === null) return;
      const t = this.scene.add.text(x, y, arrowChar[dir], {
        fontSize: '12px', color: '#4ecca3', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(5);
      this._gfx.push(t);
    });
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
