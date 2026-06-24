import Phaser from 'phaser';
import { GAME_W, GAME_H, HUD_H, isStrengthenedZone } from '../constants';

export const ROOM_W = GAME_W;           // 방 너비 = 캔버스 너비
export const ROOM_H = GAME_H - HUD_H;  // 방 높이 = 게임플레이 뷰포트 높이 (스크롤 없음)
export const WALL_T = 20;   // 벽 두께 (px)
export const DOOR_W = 80;   // 문 통로 너비 (px) — 플레이어 body(55×53) 가 여유롭게 통과하도록 80

// 배경 톤 — 강화 구역(짝수 구역 2·4)은 BootScene 가 hue-rotate 로 만든 '_p'(보라) 텍스처를 _tex()로 선택.
// base 구역(홀수 구역 1·3 = 풀숲형)은 기본 초록 grass 텍스처. (새 에셋 없이 런타임 생성)

const WALL_COLOR     = 0x3a3a5e; // 벽 색상 (진한 남색)
const OBSTACLE_COLOR = 0x2a2a50; // 장애물 색상
const SECRET_WALL_ALPHA = 0.65;  // 비밀 벽 투명도 — 일반 벽(1.0)보다 확실히 비쳐 구분되되, 얼핏 보면 지나치기 쉽게
const SECRET_WALL_REVEAL_ALPHA = 0.2; // '예리한 후각' 패시브 보유 시 — 벽이 뚜렷하게 비쳐 쉽게 감지
const DOOR_LOCKED    = 0x111133; // 잠긴 문 블록 색상
const DOOR_OPEN_HINT = 0x1e1e3a; // 열린 문 어두운 배경 색상

// 수평 문 X 시작 / 수직 문 Y 시작
export const DOOR_HX = (ROOM_W - DOOR_W) / 2;   // 수평 문(상·하) 좌측 x 좌표 (= 165)
export const DOOR_VY = (ROOM_H - DOOR_W) / 2;   // 수직 문(좌·우) 상단 y 좌표 (= 392)

export default class Room {
  constructor(scene, data, floorNum = 1) {
    this.scene = scene;
    this.data  = data;
    this._purple = isStrengthenedZone(floorNum);  // 강화 구역(2·4) → 보라톤 / base 구역(1·3) → 초록

    this.wallGroup      = scene.physics.add.staticGroup();
    this.obstacleGroup  = scene.physics.add.staticGroup();
    this._doorBlocks    = {};  // dir → rect
    this._splitWalls    = {};  // dir → [piece1, piece2] (문이 있는 방향의 분할 벽 세그먼트)
    this._gfx           = [];  // 비물리 시각 오브젝트
    this._secretWallData = null; // 비밀 벽 상태
    this._onAttackFired  = null; // 비밀 벽 이벤트 리스너 참조 (정리용)
    this._breakables       = []; // 부술 수 있는 장애물(stump) gameObject 목록
    this._onAttackBreakable = null; // 부술 수 있는 장애물 attack-fired 리스너 참조 (정리용)

    this._buildFloor();
    this._buildWalls();
    this._buildObstacles();
    if (data.type === 'shop') this._buildShopAmbience();
    if (data.secretDoor) this._buildSecretWall(data.secretDoor.dir, data.secretDoor.targetType);
  }

  /** 전투방 진입 시 모든 연결 문을 물리 블록으로 막음 */
  lockDoors() {
    Object.entries(this.data.doors).forEach(([dir, nid]) => {
      if (nid === null || this._doorBlocks[dir]) return;
      // 분할 벽 2개를 숨기고 방향 전체를 덮는 단일 통짜 벽으로 교체.
      // 분리된 세그먼트가 물리 바디 경계를 만들어 캐릭터가 걸리는 문제를 해결한다.
      const splitPieces = this._splitWalls[dir];
      if (splitPieces) {
        splitPieces.forEach(p => { if (p.body) p.body.enable = false; p.setVisible(false); });
      }
      const block = this._makeFullWall(dir);
      this._doorBlocks[dir] = block;
    });
  }

  /** 방 클리어 시 문 잠금 해제 + 시각 힌트 추가 */
  unlockDoors() {
    Object.entries(this._doorBlocks).forEach(([dir, block]) => {
      if (block.body) block.body.enable = false;
      block.setVisible(false);
      // 통짜 벽 제거 후 분할 세그먼트 복원 (개구부 유지)
      const splitPieces = this._splitWalls[dir];
      if (splitPieces) {
        splitPieces.forEach(p => { if (p.body) p.body.enable = true; p.setVisible(true); });
      }
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
    if (this._onAttackFired) {
      this.scene.events.off('attack-fired', this._onAttackFired, this);
      this._onAttackFired = null;
    }
    if (this._onAttackBreakable) {
      this.scene.events.off('attack-fired', this._onAttackBreakable, this);
      this._onAttackBreakable = null;
    }
    this.wallGroup.destroy(true);
    this.obstacleGroup.destroy(true);
    this._gfx.forEach(g => { if (g?.active) g.destroy(); });
  }

  // ── private ─────────────────────────────────────────

  /** 강화 구역(2·4) 방이면 '_p'(보라톤) 텍스처 키로 치환 (BootScene 가 hue-rotate 로 생성) */
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
    const sd = this.data.secretDoor?.dir ?? null; // 비밀 벽이 차지하는 방향 (개구부 처리)
    const add = (x1, y1, x2, y2) => {
      const w = x2 - x1, h = y2 - y1;
      const sprite = this.scene.add.tileSprite(x1 + w / 2, y1 + h / 2, w, h, this._tex('obstacle_fence'));
      sprite.setDepth(2);
      this.scene.physics.add.existing(sprite, true);
      this.wallGroup.add(sprite);
      this._gfx.push(sprite);
      return sprite;
    };

    // 상단
    if (doors.up !== null || sd === 'up') {
      const p1 = add(0, 0, DOOR_HX, WALL_T);
      const p2 = add(DOOR_HX + DOOR_W, 0, ROOM_W, WALL_T);
      if (doors.up !== null) this._splitWalls.up = [p1, p2];
    } else { add(0, 0, ROOM_W, WALL_T); }

    // 하단
    if (doors.down !== null || sd === 'down') {
      const p1 = add(0, ROOM_H - WALL_T, DOOR_HX, ROOM_H);
      const p2 = add(DOOR_HX + DOOR_W, ROOM_H - WALL_T, ROOM_W, ROOM_H);
      if (doors.down !== null) this._splitWalls.down = [p1, p2];
    } else { add(0, ROOM_H - WALL_T, ROOM_W, ROOM_H); }

    // 좌측
    if (doors.left !== null || sd === 'left') {
      const p1 = add(0, 0, WALL_T, DOOR_VY);
      const p2 = add(0, DOOR_VY + DOOR_W, WALL_T, ROOM_H);
      if (doors.left !== null) this._splitWalls.left = [p1, p2];
    } else { add(0, 0, WALL_T, ROOM_H); }

    // 우측
    if (doors.right !== null || sd === 'right') {
      const p1 = add(ROOM_W - WALL_T, 0, ROOM_W, DOOR_VY);
      const p2 = add(ROOM_W - WALL_T, DOOR_VY + DOOR_W, ROOM_W, ROOM_H);
      if (doors.right !== null) this._splitWalls.right = [p1, p2];
    } else { add(ROOM_W - WALL_T, 0, ROOM_W, ROOM_H); }
  }

  /** 잠금 시 방향 전체를 단일 tileSprite로 덮는 통짜 벽 생성 */
  _makeFullWall(dir) {
    let x1, y1, x2, y2;
    switch (dir) {
      case 'up':    x1 = 0;            y1 = 0;            x2 = ROOM_W; y2 = WALL_T;          break;
      case 'down':  x1 = 0;            y1 = ROOM_H-WALL_T; x2 = ROOM_W; y2 = ROOM_H;          break;
      case 'left':  x1 = 0;            y1 = 0;            x2 = WALL_T;  y2 = ROOM_H;          break;
      case 'right': x1 = ROOM_W-WALL_T; y1 = 0;           x2 = ROOM_W;  y2 = ROOM_H;          break;
    }
    const w = x2 - x1, h = y2 - y1;
    const sprite = this.scene.add.tileSprite(x1 + w/2, y1 + h/2, w, h, this._tex('obstacle_fence'));
    sprite.setDepth(3);
    this.scene.physics.add.existing(sprite, true);
    this.wallGroup.add(sprite);
    this._gfx.push(sprite);
    return sprite;
  }

  _buildObstacles() {
    // 상점방·시작방·비밀방: 장애물 없음
    if (this.data.type === 'shop' || this.data.type === 'start'
        || this.data.type === 'secret_cache' || this.data.type === 'secret_vault') {
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
      if (type === 'stump') this._breakables.push(obs); // 부술 수 있는 상자형 장애물
    });

    // 부술 수 있는 장애물이 있으면 근접 공격 타격 리스너 등록 (비밀 벽과 별개의 리스너)
    if (this._breakables.length > 0) {
      this._onAttackBreakable = ({ tierData, playerX, playerY }) => {
        for (let i = this._breakables.length - 1; i >= 0; i--) {
          const go = this._breakables[i];
          if (!go.active) { this._breakables.splice(i, 1); continue; }
          const dist = Phaser.Math.Distance.Between(playerX, playerY, go.x, go.y);
          if (dist <= (tierData.radius ?? 60) + go.displayWidth / 2) {
            this._breakables.splice(i, 1);
            this._breakStump(go); // 1타 즉시 파괴
          }
        }
      };
      this.scene.events.on('attack-fired', this._onAttackBreakable, this);
    }
  }

  /** stump 파괴 — 충돌 즉시 해제 + 붕괴 연출 후 destroy, obstacle-broken 이벤트로 드롭 위임 */
  _breakStump(go) {
    if (this.data.obstacleLayout) {
      const idx = this.data.obstacleLayout.findIndex(
        o => Math.abs(o.x - go.x) < 1 && Math.abs(o.y - go.y) < 1,
      );
      if (idx !== -1) this.data.obstacleLayout.splice(idx, 1);
    }
    if (go.body) go.body.enable = false;
    this.obstacleGroup.remove(go, false, false);
    const gi = this._gfx.indexOf(go);
    if (gi !== -1) this._gfx.splice(gi, 1);

    this.scene.tweens.add({
      targets: go, alpha: { from: 1, to: 0 },
      scaleX: go.scaleX * 1.3, scaleY: go.scaleY * 1.3,
      duration: 200, ease: 'Quad.Out',
      onComplete: () => { if (go.active) go.destroy(); },
    });

    this.scene.events.emit('obstacle-broken', { x: go.x, y: go.y });
  }

  _drawOpenDoorHints() {
    const hints = [
      { dir: 'up',    x: ROOM_W / 2,          y: WALL_T / 2 },
      { dir: 'down',  x: ROOM_W / 2,          y: ROOM_H - WALL_T / 2 },
      { dir: 'left',  x: WALL_T / 2,          y: ROOM_H / 2 },
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

  /** 비밀 문 개방 후 해당 방향 화살표만 단독 추가 — 기존 힌트 중복 방지 */
  drawSecretDoorHint(dir) {
    const POS = {
      up:    { x: ROOM_W / 2,          y: WALL_T / 2 },
      down:  { x: ROOM_W / 2,          y: ROOM_H - WALL_T / 2 },
      left:  { x: WALL_T / 2,          y: ROOM_H / 2 },
      right: { x: ROOM_W - WALL_T / 2, y: ROOM_H / 2 },
    };
    const arrowChar = { up: '▲', down: '▼', left: '◀', right: '▶' };
    const { x, y } = POS[dir];
    const t = this.scene.add.text(x, y, arrowChar[dir], {
      fontSize: '12px', color: '#88aaff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(5);
    this._gfx.push(t);
  }

  /** 상점방 한정: 따뜻한 톤 오버레이 (원형 글로우는 상호작용 범위로 오인되어 제거) */
  _buildShopAmbience() {
    const overlay = this.scene.add.rectangle(
      ROOM_W / 2, ROOM_H / 2, ROOM_W, ROOM_H, 0x3a2818, 0.22,
    ).setDepth(0.5);
    this._gfx.push(overlay);
  }

  // ── 비밀 벽 (BREAKABLE WALL) ─────────────────────────

  /**
   * 비밀 방 입구 벽 생성 — 도어 개구부(DOOR_W × WALL_T 또는 WALL_T × DOOR_W)를 채우는
   * 타일스프라이트 + 공격 타격 감지 리스너.
   * 일반 울타리 텍스처를 그대로 쓰되 약한 투명도(SECRET_WALL_ALPHA)만 적용 — 색조·맥동 없이,
   * 자세히 보면 미묘하게 비치지만 얼핏 지나치기 쉽게 한다.
   * '예리한 후각'(player.hasSecretSense) 보유 시 SECRET_WALL_REVEAL_ALPHA(0.2)로 뚜렷하게 비친다.
   * 벽이 이미 파괴된(저장 복원 시 doors[dir] !== null) 경우는 건너뜀.
   */
  _buildSecretWall(dir, targetType) {
    if (this.data.doors[dir] !== null) return; // 이미 파괴된 벽 — 개구부만 열린 상태로 유지

    const isVault = targetType === 'secret_vault';
    const maxHits = isVault ? 5 : 3;
    const restAlpha = this.scene.player?.hasSecretSense ? SECRET_WALL_REVEAL_ALPHA : SECRET_WALL_ALPHA;

    const a = this._doorArea(dir);
    const go = this.scene.add.tileSprite(a.cx, a.cy, a.w, a.h, this._tex('obstacle_fence'));
    go.setDepth(2).setAlpha(restAlpha); // 일반 벽(depth 2)과 동일 톤, 투명도만 미세하게
    this.scene.physics.add.existing(go, true);
    this.wallGroup.add(go);
    this._gfx.push(go);

    const crackGfx = this.scene.add.graphics().setDepth(4);
    this._gfx.push(crackGfx);

    this._secretWallData = { go, crackGfx, pulseTween: null, hits: 0, maxHits, dir, restAlpha };

    this._onAttackFired = ({ tierData, playerX, playerY }) => {
      if (!this._secretWallData) return;
      const dist = Phaser.Math.Distance.Between(playerX, playerY, go.x, go.y);
      if (dist <= (tierData.radius ?? 60) + 32) this._hitSecretWall();
    };
    this.scene.events.on('attack-fired', this._onAttackFired, this);
  }

  _hitSecretWall() {
    const d = this._secretWallData;
    if (!d || d.hits >= d.maxHits) return;
    d.hits++;

    // 피격 플래시 — 잠깐 흐려졌다 원래 투명도로 복귀
    this.scene.tweens.add({
      targets: d.go, alpha: { from: 0.3, to: d.restAlpha }, duration: 100,
    });

    this._updateCrackVisual(d);

    if (d.hits >= d.maxHits) {
      this.scene.time.delayedCall(120, () => this._breakSecretWall());
    }
  }

  _updateCrackVisual(d) {
    const { crackGfx, go, hits, maxHits } = d;
    crackGfx.clear();
    if (hits === 0) return;

    const cx = go.x, cy = go.y;
    const prog = hits / maxHits;
    // 균열선 — 진행도에 따라 단계적으로 추가
    const lines = [
      [[-4, -3, 3, 2]],
      [[-4, -3, 3, 2], [2, 4, -3, -1]],
      [[-4, -3, 3, 2], [2, 4, -3, -1], [-1, 3, 5, -4]],
      [[-4, -3, 3, 2], [2, 4, -3, -1], [-1, 3, 5, -4], [-5, 1, 4, -2]],
      [[-4, -3, 3, 2], [2, 4, -3, -1], [-1, 3, 5, -4], [-5, 1, 4, -2], [0, -5, -2, 4]],
    ];
    const stage = Math.min(hits - 1, lines.length - 1);
    lines[stage].forEach(([x1, y1, x2, y2], i) => {
      crackGfx.lineStyle(1.5, 0xffffff, 0.4 + prog * 0.5);
      crackGfx.beginPath();
      crackGfx.moveTo(cx + x1 * 3, cy + y1 * 3);
      crackGfx.lineTo(cx + x2 * 3, cy + y2 * 3);
      crackGfx.strokePath();
    });
  }

  _breakSecretWall() {
    const d = this._secretWallData;
    if (!d) return;
    this._secretWallData = null;

    if (this._onAttackFired) {
      this.scene.events.off('attack-fired', this._onAttackFired, this);
      this._onAttackFired = null;
    }

    d.pulseTween?.stop();
    if (d.go.body) { d.go.body.enable = false; this.wallGroup.remove(d.go, false, false); }
    d.crackGfx?.destroy();

    // 붕괴 연출 — 밝게 터진 후 페이드아웃
    this.scene.tweens.add({
      targets: d.go, alpha: { from: 1, to: 0 }, scaleX: 1.3, scaleY: 1.3,
      duration: 320, ease: 'Quad.Out',
      onComplete: () => { if (d.go.active) d.go.destroy(); },
    });

    this.scene.events.emit('secret-door-opened', {
      roomId:       this.data.id,
      dir:          d.dir,
      targetRoomId: this.data.secretDoor.roomId,
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
