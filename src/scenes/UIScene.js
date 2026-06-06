import Phaser from 'phaser';
import { GAME_W, GAME_H, HUD_H } from '../constants';
import PassiveItem, { ITEM_DEFS } from '../entities/PassiveItem';

// ── 상단 패널 레이아웃 ────────────────────────────────
const TOP_H      = HUD_H; // 상단 패널 높이 — constants.HUD_H 와 반드시 일치
const DIVIDER_X  = 212;   // 상태 영역 | 맵 영역 구분선 x

// 충전 게이지 (상단 패널 안, 상태 영역 중앙)
const CHARGE_CX  = DIVIDER_X / 2;  // = 106
const CHARGE_W   = 160;
const CHARGE_H   = 7;
const CHARGE_Y   = 13;
const TIER1_POS  = CHARGE_W * (0.3 / 0.8);

// HP 바
const HP_BAR_W   = 148;
const HP_BAR_H   = 10;
const HP_X       = 16;
const HP_LABEL_Y = 32;
const HP_BAR_Y   = 45;

// 미니맵 (맵 영역 안)
const MM_OX  = 220;   // 좌상단 x
const MM_OY  = 20;    // 좌상단 y
const MM_CW  = 13;
const MM_CH  = 9;
const MM_PAD = 2;

// 확대 미니맵 오버레이
const MM_LARGE_CW  = 32;
const MM_LARGE_CH  = 32;
const MM_LARGE_PAD = 6;

// 가방 버튼 (맵 영역 우측)
const BAG_CX = GAME_W - 18;   // = 372
const BAG_CY = 54;
const BAG_W  = 30;
const BAG_H  = 24;

// 보스 HP 바
const BOSS_BAR_W = 300;
const BOSS_BAR_H = 18;

// 구역 메타 — 구역 1: 1~5층(풀숲), 구역 2: 6~10층(더 깊은 숲)
const ZONE_NAMES = { 1: '풀숲', 2: '깊은 숲', 3: '인간' };
function zoneOf(floor) { return floor <= 5 ? 1 : floor <= 10 ? 2 : 3; }

export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    this._prevTier       = 0;
    this._mmCells        = [];
    this._mmBg           = null;
    this._slotRects      = [];
    this._bagOpen        = false;
    this._bagItemEls     = [];
    this._bagStaticEls   = [];
    this._itemScrollOffset = 0;
    this._itemMaskGfx    = null;
    this._shopOpen       = false;
    this._shopCardEls    = [];
    this._shopStaticEls  = [];
    this._shopSlots      = null;
    this._minimapOpen        = false;
    this._mmLargeCells       = [];
    this._minimapStaticEls   = [];
    this._currentDungeonData = null;
    this._currentRoomId      = null;
    this._currentFloor       = 1;
    this._dialogueOpen   = false;
    this._dlgLines       = [];
    this._dlgLineIdx     = 0;
    this._dlgOnComplete  = null;
    this._dlgTyping      = false;
    this._dlgFullText    = '';
    this._dlgTypeTimer   = null;

    this._buildTopPanel();
    this._buildChargeGauge();
    this._buildHPBar();
    this._buildCoreCounter();
    this._buildBagButton();
    this._buildSkillSlots();
    this._buildBossHPBar();
    this._buildBagOverlay();
    this._buildShopOverlay();
    this._buildDialogueOverlay();
    this._buildMinimapHitArea();
    this._buildMinimapOverlay();
    this._bindKeys();

    this.scene.get('GameScene').events.on(
      'room-entered',
      ({ roomData, dungeonData }) => {
        this._currentDungeonData = dungeonData;
        this._currentRoomId      = roomData.id;
        this._refreshMinimap(dungeonData, roomData.id);
        if (this._minimapOpen) this._refreshLargeMinimap();
      },
      this,
    );
    this.scene.get('GameScene').events.on(
      'floor-changed',
      (floor) => {
        this._currentFloor = floor;
        this._floorText.setText(`Z${zoneOf(floor)} · F${floor}`);
        if (this._minimapOpen) this._refreshLargeMinimap();
      },
      this,
    );

    // UIScene은 GameScene이 첫 방을 진입한 뒤에 launch되므로
    // 1층 시작 시 room-entered 이벤트를 놓친다 — roomManager에서 직접 초기화
    const rm = this.scene.get('GameScene').roomManager;
    if (rm?.dungeonData && rm?.currentRoomData) {
      this._currentDungeonData = rm.dungeonData;
      this._currentRoomId      = rm.currentRoomData.id;
      this._refreshMinimap(rm.dungeonData, rm.currentRoomData.id);
    }
  }

  update() {
    if (this._bagOpen || this._shopOpen || this._minimapOpen || this._dialogueOpen) return;
    const { player, attackManager, enemyManager } = this.gameScene ?? {};
    if (player)        this._updateHP(player.hp, player.maxHp);
    if (attackManager) this._updateChargeGauge(attackManager);
    if (enemyManager)  this._coreText.setText(String(enemyManager.coreCount));
    if (attackManager && enemyManager) this._updateBSlot(attackManager, enemyManager);
    if (enemyManager)  this._updateBossHPBar(enemyManager.boss);
  }

  // ── 상단 패널 배경 + 구분선 ─────────────────────────

  _buildTopPanel() {
    // 전체 배경
    this.add.rectangle(0, 0, GAME_W, TOP_H, 0x080810, 0.82).setOrigin(0, 0);
    // 하단 테두리 (게임 플레이 영역과의 경계선)
    this.add.rectangle(0, TOP_H, GAME_W, 2, 0x3366aa, 1).setOrigin(0, 0);
    // 상태 | 맵 구분선
    this.add.rectangle(DIVIDER_X, TOP_H / 2 + 6, 1, TOP_H - 16, 0x334466, 0.9).setOrigin(0.5, 0.5);
    // 구역·층 표시기 (미니맵 상단 위 빈 공간)
    this._floorText = this.add.text(272, 10, 'Z1 · F1', {
      fontSize: '10px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);
  }

  // ── 충전 게이지 (상태 영역 상단) ─────────────────────

  _buildChargeGauge() {
    const lx = CHARGE_CX - CHARGE_W / 2;
    this.add.rectangle(CHARGE_CX, CHARGE_Y, CHARGE_W, CHARGE_H, 0x1a1a2e).setOrigin(0.5, 0.5);
    this._cgFill = this.add.rectangle(lx, CHARGE_Y, 0, CHARGE_H, 0x4ecca3).setOrigin(0, 0.5);
    // 1단계 구분 마커
    this.add.rectangle(lx + TIER1_POS, CHARGE_Y, 2, CHARGE_H + 6, 0x445566).setOrigin(0.5, 0.5);
    this._cgLabel = this.add.text(lx + CHARGE_W + 6, CHARGE_Y, '', {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
  }

  _updateChargeGauge(atk) {
    if (!atk.isCharging) {
      this._cgFill.width = 0; this._cgLabel.setText(''); this._prevTier = 0; return;
    }
    const { chargeNormalized, currentTier } = atk;
    if (currentTier !== this._prevTier) {
      this.tweens.add({ targets: this._cgFill, scaleY: { from: 2.2, to: 1 }, duration: 140, ease: 'Back.Out' });
      this._prevTier = currentTier;
    }
    this._cgFill.width = CHARGE_W * chargeNormalized;
    this._cgFill.setFillStyle(atk.tierColor);
    this._cgLabel.setText(atk.tierLabel);
    this._cgLabel.setColor('#' + atk.tierColor.toString(16).padStart(6, '0'));
  }

  // ── HP 바 ────────────────────────────────────────────

  _buildHPBar() {
    this.add.text(HP_X, HP_LABEL_Y, 'HP', {
      fontSize: '11px', color: '#7788aa', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
    this.add.rectangle(HP_X + 20, HP_BAR_Y, HP_BAR_W, HP_BAR_H, 0x1c1c2a).setOrigin(0, 0.5);
    this._hpFill = this.add.rectangle(HP_X + 20, HP_BAR_Y, HP_BAR_W, HP_BAR_H, 0xe63946).setOrigin(0, 0.5);
    this._hpText = this.add.text(HP_X + 20 + HP_BAR_W + 6, HP_BAR_Y, '100', {
      fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
  }

  _updateHP(hp, maxHp) {
    const r = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    this._hpFill.width = HP_BAR_W * r;
    this._hpFill.setFillStyle(r > 0.5 ? 0xe63946 : r > 0.25 ? 0xf4a261 : 0xff2222);
    this._hpText.setText(String(Math.ceil(hp)));
  }

  // ── 코어 카운터 ──────────────────────────────────────

  _buildCoreCounter() {
    const y = HP_BAR_Y + 20;
    this.add.circle(HP_X + 6, y, 5, 0x00e5ff);
    this._coreText = this.add.text(HP_X + 16, y, '0', {
      fontSize: '12px', color: '#00e5ff', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
  }

  // ── 미니맵 ───────────────────────────────────────────

  _refreshMinimap(dungeonData, currentId) {
    this._mmCells.forEach(c => c?.destroy());
    this._mmCells = [];
    if (this._mmBg) { this._mmBg.destroy(); this._mmBg = null; }

    const { rooms, gridCols, gridRows } = dungeonData;
    const totalW = gridCols * MM_CW;
    const totalH = gridRows * MM_CH;
    const ox = MM_OX;
    const oy = MM_OY;
    const mapReveal = this.gameScene?.player?.hasMapReveal ?? false;

    this._mmBg = this.add
      .rectangle(ox - MM_PAD, oy - MM_PAD, totalW + MM_PAD * 2, totalH + MM_PAD * 2, 0x000000, 0.65)
      .setOrigin(0, 0);

    rooms.filter(r => r.visited || mapReveal).forEach(r => {
      const cx = ox + r.col * MM_CW + MM_CW / 2;
      const cy = oy + r.row * MM_CH + MM_CH / 2;
      const unvisited = mapReveal && !r.visited;
      const color = r.id === currentId ? 0x4ecca3
        : r.type === 'start'  ? 0x888844
        : r.type === 'shop'   ? 0xddcc22
        : r.type === 'boss'   ? (r.cleared ? 0x554444 : 0xff2222)
        : r.cleared           ? 0x445566
        :                       0x664444;

      const cell = this.add.rectangle(cx, cy, MM_CW - 2, MM_CH - 2, color);
      if (unvisited) cell.setAlpha(0.6);
      this._mmCells.push(cell);

      const { doors } = r;
      [
        { dir: 'up',    mx: cx,              my: cy - MM_CH / 2 + 1 },
        { dir: 'down',  mx: cx,              my: cy + MM_CH / 2 - 1 },
        { dir: 'left',  mx: cx - MM_CW / 2 + 1, my: cy },
        { dir: 'right', mx: cx + MM_CW / 2 - 1, my: cy },
      ].forEach(({ dir, mx, my }) => {
        if (doors[dir] === null) return;
        const dot = this.add.rectangle(mx, my, 2, 2, 0xaaaaaa);
        if (unvisited) dot.setAlpha(0.6);
        this._mmCells.push(dot);
      });
    });
  }

  // ── 미니맵 클릭 히트 영역 + 확대 힌트 ───────────────

  _buildMinimapHitArea() {
    // 셀이 위에 그려져도 픽업되도록 미니맵 영역 전체를 덮는 투명 hit rect
    const totalW = 8 * MM_CW + MM_PAD * 2;  // 격자 폭 고정 (DungeonGenerator GRID_COLS=8)
    const totalH = 6 * MM_CH + MM_PAD * 2;  // 격자 높이 고정 (GRID_ROWS=6)
    const hit = this.add
      .rectangle(MM_OX - MM_PAD, MM_OY - MM_PAD, totalW, totalH, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setDepth(10)
      .setInteractive({ cursor: 'pointer' });
    hit.on('pointerdown', () => this._openMinimap());
    hit.on('pointerover', () => { if (this._mmZoomIcon) this._mmZoomIcon.setColor('#ffffff'); });
    hit.on('pointerout',  () => { if (this._mmZoomIcon) this._mmZoomIcon.setColor('#88aacc'); });

    // 확대 힌트 아이콘 (미니맵 우상단)
    this._mmZoomIcon = this.add.text(MM_OX + 8 * MM_CW - 2, MM_OY - 1, '⊕', {
      fontSize: '11px', color: '#88aacc', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(11);
  }

  // ── 확대 미니맵 오버레이 ─────────────────────────────

  _buildMinimapOverlay() {
    const panelW = 340, panelH = 480;
    const panelX = GAME_W / 2, panelY = GAME_H / 2;

    const backdrop = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.84)
      .setOrigin(0, 0).setDepth(100).setInteractive();
    backdrop.on('pointerdown', () => this._closeMinimap());

    // 패널 자체를 인터랙티브로 — 패널 내부 클릭이 backdrop 까지 도달하지 못하게 흡수
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0c0c18)
      .setStrokeStyle(2, 0x445588, 0.9).setDepth(101).setInteractive();

    const title = this.add.text(panelX, panelY - panelH / 2 + 22, 'MAP', {
      fontSize: '15px', color: '#99aabb', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(102);

    this._mmOverlayTitleText = this.add.text(panelX, panelY - panelH / 2 + 42, '', {
      fontSize: '12px', color: '#4ecca3', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(102);

    const titleLine = this.add.rectangle(panelX, panelY - panelH / 2 + 58, panelW - 24, 1, 0x334466)
      .setDepth(102);

    const closeBtn = this.add.text(panelX + panelW / 2 - 18, panelY - panelH / 2 + 22, '✕', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(102).setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerdown', () => this._closeMinimap());
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#667788'));

    // 범례 (하단)
    const legendY = panelY + panelH / 2 - 44;
    const legend = this.add.text(panelX, legendY,
      '■ 현재   ■ 클리어   ■ 미클리어   ■ 상점   ■ 보스',
      { fontSize: '9px', color: '#5a6878', fontFamily: 'monospace' }
    ).setOrigin(0.5).setDepth(102);

    this._minimapStaticEls = [backdrop, panel, title, this._mmOverlayTitleText, titleLine, closeBtn, legend];
    this._minimapStaticEls.forEach(el => el.setVisible(false));

    this._mmOverlayCenterX = panelX;
    this._mmOverlayCenterY = panelY + 8;  // 타이틀 영역 보정용 약간 아래
  }

  _openMinimap() {
    if (this._minimapOpen || this._bagOpen || this._shopOpen) return;
    if (!this._currentDungeonData) return;  // 던전 데이터 없으면 열지 않음
    this._minimapOpen = true;
    this._minimapStaticEls.forEach(el => el.setVisible(true));
    this._refreshLargeMinimap();
    this.scene.get('GameScene').scene.pause();
  }

  _closeMinimap() {
    if (!this._minimapOpen) return;
    this._minimapOpen = false;
    this._minimapStaticEls.forEach(el => el.setVisible(false));
    this._mmLargeCells.forEach(el => { if (el.active) el.destroy(); });
    this._mmLargeCells = [];
    this.scene.get('GameScene').scene.resume();
  }

  _refreshLargeMinimap() {
    this._mmLargeCells.forEach(el => { if (el.active) el.destroy(); });
    this._mmLargeCells = [];
    if (!this._currentDungeonData) return;

    const floor    = this._currentFloor;
    const zone     = zoneOf(floor);
    const zoneName = ZONE_NAMES[zone] ?? '';
    this._mmOverlayTitleText.setText(`ZONE ${zone}${zoneName ? ' · ' + zoneName : ''}   ·   FLOOR ${floor}`);

    const { rooms, gridCols, gridRows } = this._currentDungeonData;
    const totalW = gridCols * MM_LARGE_CW;
    const totalH = gridRows * MM_LARGE_CH;
    const ox = this._mmOverlayCenterX - totalW / 2;
    const oy = this._mmOverlayCenterY - totalH / 2;
    const mapReveal = this.gameScene?.player?.hasMapReveal ?? false;

    const bg = this.add.rectangle(
      ox - MM_LARGE_PAD, oy - MM_LARGE_PAD,
      totalW + MM_LARGE_PAD * 2, totalH + MM_LARGE_PAD * 2,
      0x000000, 0.6,
    ).setOrigin(0, 0).setDepth(102);
    this._mmLargeCells.push(bg);

    rooms.filter(r => r.visited || mapReveal).forEach(r => {
      const cx = ox + r.col * MM_LARGE_CW + MM_LARGE_CW / 2;
      const cy = oy + r.row * MM_LARGE_CH + MM_LARGE_CH / 2;
      const isCurrent = r.id === this._currentRoomId;
      const unvisited = mapReveal && !r.visited;
      const color = isCurrent           ? 0x4ecca3
        : r.type === 'start'  ? 0x888844
        : r.type === 'shop'   ? 0xddcc22
        : r.type === 'boss'   ? (r.cleared ? 0x554444 : 0xff2222)
        : r.cleared           ? 0x445566
        :                       0x664444;

      const cell = this.add.rectangle(cx, cy, MM_LARGE_CW - 4, MM_LARGE_CH - 4, color).setDepth(103);
      if (isCurrent) cell.setStrokeStyle(2, 0xffffff, 0.9);
      if (unvisited) cell.setAlpha(0.6);
      this._mmLargeCells.push(cell);

      // 방 유형 라벨
      let label = '';
      if (r.type === 'start')      label = 'S';
      else if (r.type === 'shop')  label = '$';
      else if (r.type === 'boss')  label = 'B';
      if (label) {
        const lbl = this.add.text(cx, cy, label, {
          fontSize: '13px', color: '#0a0a14', fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(104);
        if (unvisited) lbl.setAlpha(0.6);
        this._mmLargeCells.push(lbl);
      }

      // 문 연결 표시 (인접 셀까지 짧은 라인)
      const { doors } = r;
      [
        { dir: 'up',    mx: cx,                       my: cy - MM_LARGE_CH / 2 + 1, w: 4, h: 4 },
        { dir: 'down',  mx: cx,                       my: cy + MM_LARGE_CH / 2 - 1, w: 4, h: 4 },
        { dir: 'left',  mx: cx - MM_LARGE_CW / 2 + 1, my: cy,                       w: 4, h: 4 },
        { dir: 'right', mx: cx + MM_LARGE_CW / 2 - 1, my: cy,                       w: 4, h: 4 },
      ].forEach(({ dir, mx, my, w, h }) => {
        if (doors[dir] === null) return;
        const dot = this.add.rectangle(mx, my, w, h, 0xaaaaaa).setDepth(104);
        if (unvisited) dot.setAlpha(0.6);
        this._mmLargeCells.push(dot);
      });
    });
  }

  // ── 가방 버튼 ────────────────────────────────────────

  _buildBagButton() {
    // 버튼 배경 (인터랙티브 히트 영역)
    const btn = this.add.rectangle(BAG_CX, BAG_CY, BAG_W, BAG_H, 0x0e0e1e)
      .setStrokeStyle(1.5, 0x445588, 0.9)
      .setInteractive({ cursor: 'pointer' });

    // 가방 아이콘 (그래픽스로 그리기)
    const g = this.add.graphics();
    this._drawBagIcon(g, BAG_CX, BAG_CY, 0x7788bb);

    btn.on('pointerdown', () => { if (this._bagOpen) this._closeBag(); else this._openBag(); });
    btn.on('pointerover', () => { btn.setFillStyle(0x1e1e3e); });
    btn.on('pointerout',  () => { btn.setFillStyle(0x0e0e1e); });
  }

  _drawBagIcon(g, cx, cy, color) {
    g.lineStyle(1.5, color, 1);
    // 손잡이 (상단 호)
    g.beginPath();
    g.arc(cx, cy - 4, 4, Math.PI, 0, true);
    g.strokePath();
    // 가방 몸체
    g.strokeRoundedRect(cx - 9, cy - 2, 18, 12, 2);
  }

  // ── 가방 오버레이 ─────────────────────────────────────

  _buildBagOverlay() {
    const panelW = 320, panelH = 640;
    const panelX = GAME_W / 2, panelY = GAME_H / 2;

    // 어두운 배경 — 외부 영역 탭 시 닫기
    const backdrop = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.84)
      .setOrigin(0, 0).setDepth(100)
      .setInteractive();
    backdrop.on('pointerdown', () => this._closeBag());

    // 패널 — 인터랙티브로 만들어 패널 내부 클릭이 backdrop 까지 도달하지 못하게 흡수
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0c0c18)
      .setStrokeStyle(2, 0x445588, 0.9).setDepth(101).setInteractive();

    // 상단 타이틀
    const title = this.add.text(panelX, panelY - panelH / 2 + 22, '상태 & 인벤토리', {
      fontSize: '15px', color: '#99aabb', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(102);

    // 타이틀 하단 구분선
    const titleLine = this.add.rectangle(panelX, panelY - panelH / 2 + 38, panelW - 24, 1, 0x334466)
      .setDepth(102);

    // 닫기 버튼
    const closeBtn = this.add.text(panelX + panelW / 2 - 18, panelY - panelH / 2 + 22, '✕', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(102).setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerdown', () => this._closeBag());
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#667788'));

    this._bagStaticEls = [backdrop, panel, title, titleLine, closeBtn];
    this._bagStaticEls.forEach(el => el.setVisible(false));
    this._panelY    = panelY;
    this._panelH    = panelH;
    this._panelW    = panelW;
    this._panelX    = panelX;
    this._bagPanel  = panel;

    // Mouse wheel scroll
    this.input.on('wheel', (_ptr, _objs, _dx, dy) => {
      if (!this._bagOpen) return;
      this._scrollItems(dy * 0.5);
    });

    // Touch/pointer drag-to-scroll on the panel
    let dragStartY = null;
    let dragStartScroll = 0;
    panel.on('pointerdown', (ptr) => {
      dragStartY     = ptr.y;
      dragStartScroll = this._itemScrollOffset;
    });
    panel.on('pointermove', (ptr) => {
      if (dragStartY === null) return;
      this._itemScrollOffset = dragStartScroll + (dragStartY - ptr.y);
      this._applyItemScroll();
    });
    panel.on('pointerup',  () => { dragStartY = null; });
    panel.on('pointerout', () => { dragStartY = null; });
  }

  _openBag() {
    this._bagOpen = true;
    this._itemScrollOffset = 0;
    this._bagStaticEls.forEach(el => el.setVisible(true));
    this._refreshBagContents();
    this.scene.get('GameScene').scene.pause();
  }

  _closeBag() {
    this._bagOpen = false;
    this._bagStaticEls.forEach(el => el.setVisible(false));
    this._bagItemEls.forEach(el => { if (el.active) el.destroy(); });
    this._bagItemEls = [];
    if (this._itemMaskGfx) { this._itemMaskGfx.destroy(); this._itemMaskGfx = null; }
    this._itemContainer  = null;
    this._scrollThumb    = null;
    this.scene.get('GameScene').scene.resume();
  }

  _refreshBagContents() {
    this._bagItemEls.forEach(el => { if (el.active) el.destroy(); });
    this._bagItemEls = [];
    if (this._itemMaskGfx) { this._itemMaskGfx.destroy(); this._itemMaskGfx = null; }
    this._itemContainer = null;
    this._scrollThumb   = null;

    const player = this.gameScene?.player;
    if (!player) return;

    let y = this._panelY - this._panelH / 2 + 50;
    y = this._drawStatsSection(player, y);
    y = this._drawSpecialChips(player, y);
    this._drawItemSection(player, y);
  }

  /** 스탯 섹션 — 2열 그리드. 기본값보다 강화된 항목은 청록색 강조. */
  _drawStatsSection(player, startY) {
    const cx = this._panelX;
    const w  = this._panelW - 36;
    const leftX  = cx - w / 2;
    const rightX = cx + w / 2;

    // 헤더
    this._bagItemEls.push(this.add.text(leftX, startY, 'STATS', {
      fontSize: '11px', color: '#6688aa', fontFamily: 'monospace', fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0, 0.5).setDepth(102));
    let y = startY + 16;

    const pct = (v) => `${Math.round(v * 100)}%`;
    const mult = (v) => `×${v.toFixed(2)}`;

    // 좌측 / 우측 컬럼 항목 정의. enhanced=true 면 청록 강조.
    const trapCost = Math.max(1, 3 - player.trapCostBonus);
    const stats = [
      { label: '체력',         value: `${player.hp}/${player.maxHp}`,                enhanced: player.maxHp > 100 },
      { label: '방어력',       value: `${player.armor ?? 0}`,                        enhanced: (player.armor ?? 0) > 0 },
      { label: '이동속도',     value: `${Math.round(player.baseSpeed)}`,             enhanced: player.baseSpeed > 200 },
      { label: '근거리 피해',  value: mult(player.meleeDamageMult),                  enhanced: player.meleeDamageMult > 1 },
      { label: '근거리 반경',  value: mult(player.meleeRadiusMult),                  enhanced: player.meleeRadiusMult > 1 },
      { label: '충전속도',     value: mult(player.chargeSpeedMult),                  enhanced: player.chargeSpeedMult > 1 },
      { label: '치명타율',     value: pct(player.critRate),                          enhanced: player.critRate > 0.15 },
      { label: '치명타 피해',  value: mult(player.critMult),                         enhanced: player.critMult > 1.5 },
      { label: '트랩 비용',    value: `${trapCost}◆`,                                enhanced: player.trapCostBonus > 0 },
      { label: '트랩 크기',    value: mult(player.trapSizeMult),                     enhanced: player.trapSizeMult > 1 },
      { label: '코어 배율',    value: mult(player.coreDropMult ?? 1),                enhanced: (player.coreDropMult ?? 1) > 1 },
      { label: '처치 회복',    value: `${player.healOnKill ?? 0}`,                   enhanced: (player.healOnKill ?? 0) > 0 },
      { label: '방 클리어 회복', value: `${player.hpPerRoomClear ?? 0}`,             enhanced: (player.hpPerRoomClear ?? 0) > 0 },
    ];

    const rowH = 17;
    stats.forEach((s, i) => {
      const col   = i % 2;
      const row   = Math.floor(i / 2);
      const rowY  = y + row * rowH;
      const colLX = col === 0 ? leftX : cx + 6;
      const colRX = col === 0 ? cx - 6 : rightX;

      this._bagItemEls.push(this.add.text(colLX, rowY, s.label, {
        fontSize: '10px', color: '#7788aa', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(102));
      this._bagItemEls.push(this.add.text(colRX, rowY, s.value, {
        fontSize: '11px',
        color: s.enhanced ? '#88eecc' : '#ddeeff',
        fontFamily: 'monospace',
        fontStyle: s.enhanced ? 'bold' : 'normal',
      }).setOrigin(1, 0.5).setDepth(102));
    });

    return y + Math.ceil(stats.length / 2) * rowH + 6;
  }

  /** 보유 중인 상태이상/위장 트랩 효과를 칩으로 가로 나열. 보유한 것만 표시. */
  _drawSpecialChips(player, startY) {
    const effects = [
      { on: player.hasPoison,         label: '독',         color: 0x6a3a8a, text: '#cc99ff' },
      { on: player.hasFire,           label: '화상',       color: 0x8a3a1a, text: '#ff9966' },
      { on: player.hasIce,            label: '빙결',       color: 0x2a6688, text: '#99ddff' },
      { on: player.hasThunder,        label: '연쇄',       color: 0x888822, text: '#eeff66' },
      { on: player.hasFireDisguise,   label: '화염 위장',  color: 0x8a3a1a, text: '#ff9966' },
      { on: player.hasIceDisguise,    label: '얼음 위장',  color: 0x2a6688, text: '#99ddff' },
      { on: player.hasPoisonDisguise, label: '독성 위장',  color: 0x4a6622, text: '#aadd66' },
    ].filter(e => e.on);

    if (effects.length === 0) return startY;

    const leftX = this._panelX - this._panelW / 2 + 18;
    this._bagItemEls.push(this.add.text(leftX, startY, 'EFFECTS', {
      fontSize: '11px', color: '#6688aa', fontFamily: 'monospace', fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0, 0.5).setDepth(102));
    let chipY = startY + 18;
    let chipX = leftX;
    const maxX = this._panelX + this._panelW / 2 - 18;

    effects.forEach(e => {
      const padX = 8;
      const tmpText = this.add.text(0, 0, e.label, {
        fontSize: '10px', fontFamily: 'monospace',
      }).setOrigin(0).setVisible(false);
      const w = tmpText.width + padX * 2;
      tmpText.destroy();

      // 줄바꿈
      if (chipX + w > maxX) { chipX = leftX; chipY += 22; }

      const bg = this.add.rectangle(chipX, chipY, w, 18, e.color, 0.45)
        .setStrokeStyle(1, e.color, 0.9).setOrigin(0, 0.5).setDepth(102);
      const tx = this.add.text(chipX + padX, chipY, e.label, {
        fontSize: '10px', color: e.text, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(103);
      this._bagItemEls.push(bg, tx);

      chipX += w + 6;
    });

    return chipY + 18;
  }

  /** 아이템 섹션 — 스크롤 가능한 1열 목록. 아이콘 + 이름 + 설명. */
  _drawItemSection(player, startY) {
    const items    = player.inventory ?? [];
    const leftX    = this._panelX - this._panelW / 2 + 18;
    const panelBot = this._panelY + this._panelH / 2 - 16;

    this._bagItemEls.push(this.add.text(leftX, startY + 6, `ITEMS (${items.length})`, {
      fontSize: '11px', color: '#6688aa', fontFamily: 'monospace', fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0, 0.5).setDepth(102));

    const listStartY = startY + 22;
    const iconX  = leftX + 4;
    const textX  = iconX + 18;
    const rowH   = 28;
    const visibleH = Math.max(rowH, panelBot - listStartY);

    if (items.length === 0) {
      this._bagItemEls.push(this.add.text(this._panelX, listStartY + 16, '보유 아이템 없음', {
        fontSize: '12px', color: '#445566', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(102));
      return;
    }

    const totalH   = items.length * rowH;
    const maxScroll = Math.max(0, totalH - visibleH);
    this._itemScrollOffset   = Math.max(0, Math.min(maxScroll, this._itemScrollOffset));
    this._itemTotalH         = totalH;
    this._itemVisibleH       = visibleH;
    this._itemListStartY     = listStartY;
    this._itemMaxScroll      = maxScroll;

    // 스크롤 가능한 컨테이너 — 초기 y 는 스크롤 오프셋 적용
    const container = this.add.container(0, -this._itemScrollOffset).setDepth(102);

    items.forEach((item, i) => {
      const rowY = listStartY + i * rowH + rowH / 2;
      container.add([
        this.add.rectangle(iconX, rowY, 12, 12, item.color).setOrigin(0.5),
        this.add.text(textX, rowY - 6, item.name, {
          fontSize: '11px', color: '#ddeeff', fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(0, 0.5),
        this.add.text(textX, rowY + 7, item.desc ?? '', {
          fontSize: '9px', color: '#6677aa', fontFamily: 'monospace',
        }).setOrigin(0, 0.5),
      ]);
      if (i < items.length - 1) {
        container.add(this.add.rectangle(
          this._panelX, rowY + rowH / 2, this._panelW - 36, 1, 0x1e2030,
        ));
      }
    });

    // 지오메트리 마스크로 가시 영역 클리핑
    const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(
      this._panelX - this._panelW / 2 + 2, listStartY,
      this._panelW - 4, visibleH,
    );
    container.setMask(maskGfx.createGeometryMask());

    this._itemMaskGfx   = maskGfx;
    this._itemContainer = container;
    this._bagItemEls.push(container);

    // 스크롤바 (아이템이 넘칠 때만)
    if (maxScroll > 0) {
      const sbX    = this._panelX + this._panelW / 2 - 8;
      const thumbH = Math.max(20, visibleH * visibleH / totalH);
      const thumbY = listStartY + (this._itemScrollOffset / maxScroll) * (visibleH - thumbH);

      const track = this.add.rectangle(sbX, listStartY + visibleH / 2, 3, visibleH, 0x1e2030).setDepth(103);
      const thumb = this.add.rectangle(sbX, thumbY + thumbH / 2, 3, thumbH, 0x5577aa).setDepth(104);
      this._scrollThumb    = thumb;
      this._scrollTrack    = track;
      this._bagItemEls.push(track, thumb);
    }
  }

  _scrollItems(dy) {
    if (!this._itemContainer?.active) return;
    this._itemScrollOffset += dy;
    this._applyItemScroll();
  }

  _applyItemScroll() {
    const maxScroll = this._itemMaxScroll ?? 0;
    this._itemScrollOffset = Math.max(0, Math.min(maxScroll, this._itemScrollOffset));
    if (this._itemContainer?.active) {
      this._itemContainer.y = -this._itemScrollOffset;
    }
    if (this._scrollThumb?.active && maxScroll > 0) {
      const visibleH = this._itemVisibleH;
      const totalH   = this._itemTotalH;
      const thumbH   = Math.max(20, visibleH * visibleH / totalH);
      const thumbY   = this._itemListStartY + (this._itemScrollOffset / maxScroll) * (visibleH - thumbH);
      this._scrollThumb.setY(thumbY + thumbH / 2);
    }
  }

  // ── 상점 오버레이 ────────────────────────────────────

  _buildShopOverlay() {
    const panelW = 320, panelH = 460; // 기본값(3슬롯 가정) — openShop 에서 슬롯 수에 맞춰 재조정
    const panelX = GAME_W / 2, panelY = GAME_H / 2;

    // 어두운 배경 — 외부 영역 탭 시 닫기
    const backdrop = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.75)
      .setOrigin(0, 0).setDepth(100).setInteractive();
    backdrop.on('pointerdown', () => this.closeShop());

    // 패널 — 인터랙티브로 만들어 패널 내부 클릭이 backdrop 까지 도달하지 못하게 흡수
    this._shopPanel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x18120c)
      .setStrokeStyle(2, 0xddaa44, 0.9).setDepth(101).setInteractive();

    // 상단 타이틀 + GRIM 라벨 — y 는 openShop 에서 재배치
    this._shopTitle = this.add.text(panelX - panelW / 2 + 20, panelY - panelH / 2 + 22, 'GRIM 상점', {
      fontSize: '16px', color: '#ffcc66', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(102);

    // 보유 코어 라벨
    this._shopCoreText = this.add.text(panelX + panelW / 2 - 38, panelY - panelH / 2 + 22, '◆ 0', {
      fontSize: '14px', color: '#00e5ff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(102);

    // 닫기 버튼
    this._shopCloseBtn = this.add.text(panelX + panelW / 2 - 16, panelY - panelH / 2 + 22, '✕', {
      fontSize: '16px', color: '#aa8866', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(102).setInteractive({ cursor: 'pointer' });
    this._shopCloseBtn.on('pointerdown', () => this.closeShop());
    this._shopCloseBtn.on('pointerover', () => this._shopCloseBtn.setColor('#ffffff'));
    this._shopCloseBtn.on('pointerout',  () => this._shopCloseBtn.setColor('#aa8866'));

    // 타이틀 하단 구분선
    this._shopTitleLine = this.add.rectangle(panelX, panelY - panelH / 2 + 42, panelW - 24, 1, 0x553322)
      .setDepth(102);

    this._shopStaticEls = [backdrop, this._shopPanel, this._shopTitle, this._shopCoreText, this._shopCloseBtn, this._shopTitleLine];
    this._shopStaticEls.forEach(el => el.setVisible(false));

    this._shopPanelX = panelX;
    this._shopPanelY = panelY;
    this._shopPanelW = panelW;
    this._shopPanelH = panelH;
  }

  /** 슬롯 수에 따라 패널 높이를 재계산하고 상단 앵커 요소들을 재배치 — openShop 직전에 호출 */
  _resizeShopPanelForSlots(slotCount) {
    const cardH = 110, gap = 8;
    const headerH = 60;  // 타이틀/구분선/카드 첫 머리까지의 여백
    const footerH = 30;  // 마지막 카드 ~ 패널 하단 여백
    const panelH = headerH + slotCount * cardH + (slotCount - 1) * gap + footerH;
    if (panelH === this._shopPanelH) return;
    this._shopPanelH = panelH;

    const panelX = this._shopPanelX, panelY = this._shopPanelY, panelW = this._shopPanelW;
    this._shopPanel.setSize(panelW, panelH);
    const topY = panelY - panelH / 2;
    this._shopTitle.setY(topY + 22);
    this._shopCoreText.setY(topY + 22);
    this._shopCloseBtn.setY(topY + 22);
    this._shopTitleLine.setY(topY + 42);
  }

  openShop(slots) {
    if (this._shopOpen || !slots) return;
    this._resizeShopPanelForSlots(slots.length);
    // 슬롯은 던전 생성 시점에 baked 되므로, 그 사이 보스/다른 상점에서 같은 패시브를 획득했을 수 있다.
    // 상점 오픈 시점에 보유 패시브와 충돌하는 'item' 슬롯을 다시 추첨한다.
    this._dedupeItemSlots(slots);
    this._shopOpen   = true;
    this._shopSlots  = slots;
    this._shopStaticEls.forEach(el => el.setVisible(true));
    this._refreshShopCards();
    this.scene.get('GameScene').scene.pause();
  }

  /** 보유 패시브와 겹치는 'item' 슬롯을 미보유 아이템으로 재추첨. 없으면 sold 처리. */
  _dedupeItemSlots(slots) {
    const player = this.gameScene?.player;
    if (!player) return;
    const owned = new Set((player.inventory ?? []).map(i => i.id));
    // 같은 상점에 동일 id 두 개가 들어가지 않도록 현재 슬롯 id 도 제외 집합에 포함
    const usedInShop = new Set(
      slots.filter(s => s.kind === 'item' && s.id).map(s => s.id),
    );
    slots.forEach(slot => {
      if (slot.kind !== 'item' || slot.sold) return;
      if (!owned.has(slot.id)) return;
      // 후보: ITEM_DEFS 중 보유하지 않고, 같은 상점의 다른 슬롯이 가지지 않은 id
      const candidates = Object.keys(ITEM_DEFS)
        .filter(id => !owned.has(id) && !usedInShop.has(id));
      if (candidates.length === 0) {
        slot.sold = true;
        return;
      }
      const newId = candidates[Math.floor(Math.random() * candidates.length)];
      const def   = ITEM_DEFS[newId];
      usedInShop.delete(slot.id);
      slot.id    = newId;
      slot.name  = def.name;
      slot.desc  = def.desc;
      slot.color = def.color;
      usedInShop.add(newId);
    });
  }

  closeShop() {
    if (!this._shopOpen) return;
    this._shopOpen = false;
    this._shopStaticEls.forEach(el => el.setVisible(false));
    this._shopCardEls.forEach(el => { if (el.active) el.destroy(); });
    this._shopCardEls = [];
    this._shopSlots   = null;
    this.scene.get('GameScene').scene.resume();
  }

  _refreshShopCards() {
    this._shopCardEls.forEach(el => { if (el.active) el.destroy(); });
    this._shopCardEls = [];
    if (!this._shopSlots) return;

    const em     = this.gameScene.enemyManager;
    const player = this.gameScene.player;
    this._shopCoreText.setText('◆ ' + em.coreCount);

    const cardW   = this._shopPanelW - 28;
    const cardH   = 110;
    const cardX   = this._shopPanelX;
    const startY  = this._shopPanelY - this._shopPanelH / 2 + 60;

    this._shopSlots.forEach((slot, i) => {
      const cy        = startY + i * (cardH + 8) + cardH / 2;
      const sold      = slot.sold;
      const canAfford = em.coreCount >= slot.cost;

      const bgColor = sold ? 0x0a0805 : 0x261c10;
      const stroke  = sold ? 0x332211 : 0x885533;
      const bg = this.add.rectangle(cardX, cy, cardW, cardH, bgColor)
        .setStrokeStyle(1.5, stroke, sold ? 0.5 : 0.9)
        .setDepth(102);

      // 아이콘 (좌측)
      const iconColor = this._shopIconColor(slot);
      const icon = this.add.rectangle(cardX - cardW / 2 + 26, cy, 28, 28, iconColor)
        .setDepth(103).setAlpha(sold ? 0.25 : 1);

      // 이름
      const nameColor = sold ? '#444' : '#ffe9bb';
      const name = this.add.text(cardX - cardW / 2 + 52, cy - 24, this._shopName(slot), {
        fontSize: '14px', color: nameColor, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(103);

      // 설명
      const descColor = sold ? '#333' : '#aa9977';
      const desc = this.add.text(cardX - cardW / 2 + 52, cy - 4, this._shopDesc(slot, player), {
        fontSize: '11px', color: descColor, fontFamily: 'monospace',
        wordWrap: { width: cardW - 80 },
      }).setOrigin(0, 0.5).setDepth(103);

      // 가격
      let costColor = '#ffcc44';
      if (sold)            costColor = '#444';
      else if (!canAfford) costColor = '#cc4444';
      const costStr = sold ? 'SOLD' : `◆ ${slot.cost}`;
      const cost = this.add.text(cardX + cardW / 2 - 16, cy + 32, costStr, {
        fontSize: sold ? '13px' : '15px', color: costColor,
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(1, 0.5).setDepth(103);

      this._shopCardEls.push(bg, icon, name, desc, cost);

      if (!sold) {
        bg.setInteractive({ cursor: 'pointer' });
        bg.on('pointerdown', () => this._attemptPurchase(i, bg, cost));
        bg.on('pointerover', () => bg.setFillStyle(0x362818));
        bg.on('pointerout',  () => bg.setFillStyle(0x261c10));
      }
    });
  }

  _attemptPurchase(idx, bgRef, costRef) {
    const slot = this._shopSlots?.[idx];
    if (!slot || slot.sold) return;
    const em     = this.gameScene.enemyManager;
    const player = this.gameScene.player;

    if (em.coreCount < slot.cost) {
      // 코어 부족 — 가격 빨강 깜빡 + 짧은 흔들림
      this.tweens.add({
        targets: costRef, scaleX: 1.25, scaleY: 1.25,
        duration: 90, yoyo: true, ease: 'Quad.Out',
      });
      costRef.setColor('#ff4444');
      this.time.delayedCall(380, () => { if (costRef.active) costRef.setColor('#cc4444'); });
      return;
    }

    em.spendCores(slot.cost);
    this._applyShopSlot(slot, player);
    slot.sold = true;
    // 상점 오픈 중에는 update()가 스킵되므로 HP·코어 카운터를 즉시 반영
    this._updateHP(player.hp, player.maxHp);
    this._coreText.setText(String(em.coreCount));
    this._refreshShopCards();
  }

  _applyShopSlot(slot, player) {
    // 대식가(big_trap) — healItemMult 로 회복량 ×1.1
    if (slot.kind === 'heal')      { player.heal(Math.max(1, Math.round(slot.amount * player.healItemMult))); return; }
    if (slot.kind === 'heal_pct')  { player.heal(Math.floor(player.maxHp * slot.ratio * player.healItemMult)); return; }
    if (slot.kind === 'heal_full') { player.heal(player.maxHp); return; }
    if (slot.kind === 'item') {
      // 생성 시점에 이미 선정된 패시브 적용 (slot.id 고정)
      const def = ITEM_DEFS[slot.id];
      def.apply(player);
      player.inventory.push({ id: slot.id, name: def.name, color: def.color, desc: def.desc });
      // 다음 런 시작방 풀에도 포함되도록 영속 해금 갱신
      const unlocked = PassiveItem.getUnlocked();
      if (!unlocked.includes(slot.id)) {
        unlocked.push(slot.id);
        try { localStorage.setItem('lagomorph_unlocked', JSON.stringify(unlocked)); } catch {}
      }
    }
  }

  _shopName(slot) {
    return slot.name;
  }

  _shopDesc(slot, player) {
    if (slot.kind === 'item')      return slot.dynDesc ? slot.dynDesc(player) : (slot.desc ?? '');
    if (slot.kind === 'heal')      return `HP +${slot.amount}`;
    if (slot.kind === 'heal_pct')  return `HP +${Math.floor(player.maxHp * slot.ratio)} (50%)`;
    if (slot.kind === 'heal_full') return 'HP 완전 회복';
    return '';
  }

  _shopIconColor(slot) {
    if (slot.kind === 'item')      return slot.color ?? 0xddaa44;
    if (slot.kind === 'heal_full') return 0xff6688;
    if (slot.kind === 'heal_pct')  return 0xff9966;
    // 정액 회복: 낮은 단계 청록 → 높은 단계 황녹 점진 변화
    const t = Phaser.Math.Clamp((slot.amount ?? 0) / 64, 0, 1);
    const r = Math.floor(120 + t * 130);
    const g = Math.floor(210 - t * 20);
    const b = Math.floor(160 - t * 110);
    return (r << 16) | (g << 8) | b;
  }

  // ── 보스 HP 바 ───────────────────────────────────────

  _buildBossHPBar() {
    const cx = GAME_W / 2;
    const y  = GAME_H - 52;
    this._bossBarContainer = this.add.container(0, 0).setVisible(false);

    this._bossLabel = this.add.text(cx, y - 16, 'BOSS', {
      fontSize: '13px', color: '#ff4444', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    const bg   = this.add.rectangle(cx, y, BOSS_BAR_W, BOSS_BAR_H, 0x2a0000).setOrigin(0.5, 0.5);
    this._bossHpFill = this.add.rectangle(
      cx - BOSS_BAR_W / 2, y, BOSS_BAR_W, BOSS_BAR_H, 0xff2222,
    ).setOrigin(0, 0.5);
    const border = this.add.rectangle(cx, y, BOSS_BAR_W, BOSS_BAR_H)
      .setStrokeStyle(2, 0xff4444, 0.8).setFillStyle(0x000000, 0);

    this._bossBarContainer.add([this._bossLabel, bg, this._bossHpFill, border]);
  }

  _updateBossHPBar(boss) {
    if (!boss || !boss.alive) { this._bossBarContainer.setVisible(false); return; }
    this._bossBarContainer.setVisible(true);
    if (boss.displayName && this._bossLabel.text !== boss.displayName) {
      this._bossLabel.setText(boss.displayName);
    }
    const r = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1);
    this._bossHpFill.width = BOSS_BAR_W * r;
    this._bossHpFill.setFillStyle(r > 0.5 ? 0xff2222 : 0xff6600);
  }

  // ── 스킬 슬롯 (우하단) ──────────────────────────────

  _buildSkillSlots() {
    const slotSize = 56, gap = 10;
    const slotCY   = this.scale.height - 130;
    const rightX   = GAME_W - 20;
    [
      { label: 'A', color: 0x4ecca3 },
      { label: 'B', color: 0xe63946 },
    ].forEach((slot, i) => {
      const x = rightX - slotSize / 2 - (slotSize + gap) * i;
      const y = slotCY;
      const rect = this.add.rectangle(x, y, slotSize, slotSize, 0x1a1a2e, 0.8)
        .setStrokeStyle(2, slot.color, 0.6);
      this._slotRects.push(rect);
      this.add.text(x, y, slot.label, {
        fontSize: '20px', color: '#' + slot.color.toString(16).padStart(6, '0'),
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    });
  }

  _updateBSlot(atk, em) {
    const bSlot = this._slotRects[1];
    if (!bSlot) return;
    const cost  = Math.max(1, 3 - (this.gameScene?.player?.trapCostBonus ?? 0));
    const avail = atk.bCooldownNormalized === 0 && em.coreCount >= cost;
    bSlot.setAlpha(avail ? 0.8 : 0.35);
  }

  // ── 키바인딩 ─────────────────────────────────────────

  _bindKeys() {
    const zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    const xKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    const iKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    const mKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    zKey.on('down', () => this._flashSlot(0));
    xKey.on('down', () => this._flashSlot(1));
    iKey.on('down', () => { if (this._bagOpen) this._closeBag(); else this._openBag(); });
    mKey.on('down', () => { if (this._minimapOpen) this._closeMinimap(); else this._openMinimap(); });
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._bagOpen)           this._closeBag();
      else if (this._shopOpen)     this.closeShop();
      else if (this._minimapOpen)  this._closeMinimap();
      else if (this._dialogueOpen) this.closeDialogue();
    });
  }

  _flashSlot(index) {
    const rect = this._slotRects[index];
    if (!rect) return;
    this.tweens.killTweensOf(rect);
    rect.setAlpha(1);
    this.tweens.add({ targets: rect, alpha: 0.8, duration: 200, ease: 'Quad.In' });
  }

  // ── NPC 대화 오버레이 ─────────────────────────────────

  _buildDialogueOverlay() {
    const panelW = GAME_W - 20;
    const panelH = 180;
    const panelX = GAME_W / 2;
    const panelY = GAME_H - 90;
    const L = panelX - panelW / 2;  // 10
    const T = panelY - panelH / 2;  // 664

    const backdrop = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.45)
      .setOrigin(0, 0).setDepth(90).setInteractive();
    backdrop.on('pointerdown', () => this._advanceDialogue());

    this._dlgPanel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0c0c18, 0.97)
      .setStrokeStyle(1, 0x334466, 0.8).setDepth(91).setInteractive();
    this._dlgPanel.on('pointerdown', () => this._advanceDialogue());

    // 초상화 (grim 텍스처 없으면 회색 사각형 폴백)
    if (this.textures.exists('grim')) {
      this._dlgPortrait = this.add.image(L + 34, T + 100, 'grim')
        .setDisplaySize(44, 56).setDepth(92);
    } else {
      this._dlgPortrait = this.add.rectangle(L + 34, T + 100, 44, 56, 0x3a3a4a)
        .setStrokeStyle(1, 0x556688, 0.7).setDepth(92);
    }

    // 이름 + 구분선 (헤더 영역)
    this._dlgName = this.add.text(L + 66, T + 18, 'GRIM', {
      fontSize: '13px', color: '#aabbcc', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(92);

    this._dlgDivider = this.add.rectangle(L + 12, T + 30, panelW - 24, 1, 0x334466)
      .setOrigin(0, 0.5).setDepth(92);

    // 대사 텍스트 (초상화 오른쪽)
    this._dlgText = this.add.text(L + 66, T + 42, '', {
      fontSize: '14px', color: '#ddeeff', fontFamily: 'monospace',
      wordWrap: { width: panelW - 80, useAdvancedWrap: true },
      lineSpacing: 4,
    }).setOrigin(0, 0).setDepth(92);

    // 진행 인디케이터 ▼ (깜빡임)
    this._dlgAdvance = this.add.text(panelX + panelW / 2 - 14, panelY + panelH / 2 - 16, '▼', {
      fontSize: '11px', color: '#4ecca3', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(92);
    this.tweens.add({
      targets: this._dlgAdvance, alpha: { from: 1, to: 0.2 },
      duration: 700, yoyo: true, repeat: -1,
    });

    // 마지막 줄 선택지 버튼
    const btnY = panelY + panelH / 2 - 20;
    this._dlgBtnShop = this.add.text(panelX - 55, btnY, '[둘러보기]', {
      fontSize: '14px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(92).setInteractive({ cursor: 'pointer' });
    this._dlgBtnShop.on('pointerover', () => this._dlgBtnShop.setColor('#ffffff'));
    this._dlgBtnShop.on('pointerout',  () => this._dlgBtnShop.setColor('#4ecca3'));

    this._dlgBtnLeave = this.add.text(panelX + 72, btnY, '[됐어]', {
      fontSize: '14px', color: '#88aacc', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(92).setInteractive({ cursor: 'pointer' });
    this._dlgBtnLeave.on('pointerover', () => this._dlgBtnLeave.setColor('#ffffff'));
    this._dlgBtnLeave.on('pointerout',  () => this._dlgBtnLeave.setColor('#88aacc'));

    this._dlgStaticEls = [backdrop, this._dlgPanel, this._dlgPortrait, this._dlgName,
                          this._dlgDivider, this._dlgText, this._dlgAdvance];
    this._dlgStaticEls.forEach(el => el.setVisible(false));
    this._dlgBtnShop.setVisible(false);
    this._dlgBtnLeave.setVisible(false);
  }

  openDialogue(lines, onComplete) {
    if (this._dialogueOpen) return;
    this._dialogueOpen  = true;
    this._dlgLines      = lines;
    this._dlgLineIdx    = 0;
    this._dlgOnComplete = onComplete ?? null;
    this._dlgStaticEls.forEach(el => el.setVisible(true));
    this._dlgBtnShop.setVisible(false);
    this._dlgBtnLeave.setVisible(false);
    this._dlgAdvance.setVisible(true);
    this._dlgText.setText('');
    this.scene.get('GameScene').scene.pause();
    this._typewriteLine(lines[0]);
  }

  _typewriteLine(text) {
    this._dlgTyping   = true;
    this._dlgFullText = text;
    let i = 0;
    if (this._dlgTypeTimer) { this._dlgTypeTimer.remove(); this._dlgTypeTimer = null; }
    this._dlgTypeTimer = this.time.addEvent({
      delay: 30,
      repeat: text.length - 1,
      callback: () => {
        i++;
        this._dlgText.setText(text.slice(0, i));
        if (i >= text.length) {
          this._dlgTyping    = false;
          this._dlgTypeTimer = null;
          if (this._dlgLineIdx >= this._dlgLines.length - 1) {
            this._showDialogueButtons();
          }
        }
      },
    });
  }

  _advanceDialogue() {
    if (!this._dialogueOpen) return;
    if (this._dlgTyping) {
      if (this._dlgTypeTimer) { this._dlgTypeTimer.remove(); this._dlgTypeTimer = null; }
      this._dlgTyping = false;
      this._dlgText.setText(this._dlgFullText);
      if (this._dlgLineIdx >= this._dlgLines.length - 1) this._showDialogueButtons();
      return;
    }
    if (this._dlgBtnShop.visible) return;   // 2개 버튼 — 버튼으로만 진행
    if (this._dlgBtnLeave.visible) { this.closeDialogue(); return; }  // 1개 버튼 — 아무데나 탭으로 종료
    this._dlgLineIdx++;
    if (this._dlgLineIdx < this._dlgLines.length) {
      this._dlgText.setText('');
      this._typewriteLine(this._dlgLines[this._dlgLineIdx]);
    }
  }

  _showDialogueButtons() {
    this._dlgAdvance.setVisible(false);
    this._dlgBtnLeave.removeAllListeners('pointerdown');
    this._dlgBtnLeave.on('pointerdown', () => this.closeDialogue());

    if (this._dlgOnComplete) {
      this._dlgBtnShop.setVisible(true);
      this._dlgBtnLeave.setVisible(true);
      this._dlgBtnShop.removeAllListeners('pointerdown');
      this._dlgBtnShop.on('pointerdown', () => {
        const cb = this._dlgOnComplete;
        this.closeDialogue();
        cb?.();
      });
    } else {
      // 상점 없는 대화 — [됐어]만 중앙에 표시
      this._dlgBtnShop.setVisible(false);
      this._dlgBtnLeave.setX(GAME_W / 2).setVisible(true);
    }
  }

  closeDialogue() {
    if (!this._dialogueOpen) return;
    this._dialogueOpen = false;
    if (this._dlgTypeTimer) { this._dlgTypeTimer.remove(); this._dlgTypeTimer = null; }
    this._dlgStaticEls.forEach(el => el.setVisible(false));
    this._dlgBtnShop.setVisible(false);
    this._dlgBtnLeave.setX(GAME_W / 2 + 72).setVisible(false);  // 원래 위치 복원
    this._dlgAdvance.setVisible(true);
    this.scene.get('GameScene').scene.resume();
  }
}
