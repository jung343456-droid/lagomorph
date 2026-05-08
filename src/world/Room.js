export const ROOM_W = 390;
export const ROOM_H = 844;
export const WALL_T = 20;
export const DOOR_W = 60;

const WALL_COLOR     = 0x3a3a5e;
const FLOOR_COLOR    = 0x12121e;
const FLOOR_ALT      = 0x14141f;  // 격자 타일 대비색
const OBSTACLE_COLOR = 0x2a2a50;
const DOOR_LOCKED    = 0x111133;
const DOOR_OPEN_HINT = 0x1e1e3a;  // 열린 문 어두운 배경

// 수평 문 X 시작 / 수직 문 Y 시작
export const DOOR_HX = (ROOM_W - DOOR_W) / 2;   // 165
export const DOOR_VY = (ROOM_H - DOOR_W) / 2;   // 392

export default class Room {
  constructor(scene, data) {
    this.scene = scene;
    this.data  = data;

    this.wallGroup   = scene.physics.add.staticGroup();
    this._doorBlocks = {};  // dir → rect
    this._gfx        = [];  // 비물리 시각 오브젝트

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
      this.scene.physics.add.existing(block, true);
      this.wallGroup.add(block);
      this._doorBlocks[dir] = block;
    });
  }

  /** 방 클리어 시 문 잠금 해제 + 시각 힌트 추가 */
  unlockDoors() {
    Object.entries(this._doorBlocks).forEach(([, block]) => {
      this.wallGroup.remove(block, true, true);
    });
    this._doorBlocks = {};
    this._drawOpenDoorHints();
  }

  destroy() {
    this.wallGroup.destroy(true);
    this._gfx.forEach(g => { if (g?.active) g.destroy(); });
  }

  // ── private ─────────────────────────────────────────

  _buildFloor() {
    // 체커보드 타일로 바닥 채우기
    const tileSize = 40;
    for (let row = 0; row * tileSize < ROOM_H; row++) {
      for (let col = 0; col * tileSize < ROOM_W; col++) {
        const c = (row + col) % 2 === 0 ? FLOOR_COLOR : FLOOR_ALT;
        const rect = this.scene.add.rectangle(
          col * tileSize + tileSize / 2,
          row * tileSize + tileSize / 2,
          tileSize, tileSize, c,
        ).setDepth(0);
        this._gfx.push(rect);
      }
    }
  }

  _buildWalls() {
    const { doors } = this.data;
    const add = (x1, y1, x2, y2) => {
      const w = x2 - x1, h = y2 - y1;
      const rect = this.scene.add.rectangle(x1 + w / 2, y1 + h / 2, w, h, WALL_COLOR);
      rect.setDepth(2);
      this.scene.physics.add.existing(rect, true);
      this.wallGroup.add(rect);
      this._gfx.push(rect);
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
    const count   = 1 + Math.floor(Math.random() * 3);
    const minX    = WALL_T + 50;
    const minY    = WALL_T + 50;
    const maxX    = ROOM_W - WALL_T - 50;
    const maxY    = ROOM_H - WALL_T - 50;

    for (let i = 0; i < count; i++) {
      const w = 36 + Math.floor(Math.random() * 44);
      const h = 36 + Math.floor(Math.random() * 44);
      const x = minX + Math.random() * (maxX - minX - w) + w / 2;
      const y = minY + Math.random() * (maxY - minY - h) + h / 2;

      const obs = this.scene.add.rectangle(x, y, w, h, OBSTACLE_COLOR);
      obs.setDepth(2);
      this.scene.physics.add.existing(obs, true);
      this.wallGroup.add(obs);
      this._gfx.push(obs);
    }
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
