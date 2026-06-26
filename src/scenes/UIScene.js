import Phaser from 'phaser';
import { GAME_W, GAME_H, HUD_H, zoneOf, displayFloor } from '../constants';
import PassiveItem, { ITEM_DEFS } from '../entities/PassiveItem';
import { ALTAR_POOL } from '../data/AltarPool';
import { safeInsetBottom } from '../utils/SafeArea';
import { saveRunState } from '../data/SaveManager';
import {
  getBgmVolume, getSfxVolume, isBgmMuted, isSfxMuted,
  setBgmVolume, setSfxVolume, setBgmMuted, setSfxMuted,
  setJoystickPos, setSlotPos, resetLayout, getSlotPos,
  getSlotRadius, setSlotSize, SLOT_R_MIN, SLOT_R_MAX, SLOT_R_DEFAULT,
} from '../data/Settings';

const DLG_BOTTOM_PAD = 16;  // 패널 하단 추가 여백 (floor 위에 더하는 숨 쉴 공간)
// 측정값이 0이어도 보장하는 최소 하단 확보량(게임 좌표). 일반 브라우저 탭에선 홈 인디케이터·
// 제스처바가 env()/visualViewport 로 보고되지 않으므로, 측정값과 floor 중 큰 쪽을 쓴다.
const DLG_MIN_BOTTOM = 60;

// A/B 슬롯 글자 렌더 해상도 — Scale.FIT 으로 캔버스가 확대돼도 또렷하게(고DPI 대응, 상한 3)
const SLOT_TEXT_RES = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
// 슬롯 글자/반지름 비율 — 기본 반지름 28 에서 22px (크기 조절 시 글자도 비례 스케일)
const SLOT_FONT_RATIO = 22 / 28;
const slotFontPx = (r) => Math.round(r * SLOT_FONT_RATIO) + 'px';

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

// 구역 메타 — 1: 숲(1~10) / 2: 심연(11~20, 1구역 적 혼합·강화 + 보라톤).
// zoneOf/displayFloor 는 constants 공용 헬퍼. 각 구역은 화면에 1~10층으로 표시.
const ZONE_NAMES = { 1: '숲', 2: '심연' };

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
    this._shopMode       = 'shop'; // 'shop' | 'altar' — 상점 오버레이 공용, 제단은 누진가·반복구매
    this._shopCardEls    = [];
    this._shopStaticEls  = [];
    this._shopSlots      = null;
    this._minimapOpen        = false;
    this._mmLargeCells       = [];
    this._minimapStaticEls   = [];
    this._currentDungeonData = null;
    this._currentRoomId      = null;
    this._currentFloor       = this.gameScene?.currentFloor ?? 1;  // 복원 시 저장된 층 반영
    this._dialogueOpen   = false;
    this._dlgLines       = [];
    this._dlgLineIdx     = 0;
    this._dlgOnComplete  = null;
    this._dlgTyping      = false;
    this._dlgFullText    = '';
    this._dlgTypeTimer   = null;
    this._pauseOpen      = false;
    this._settingsOpen   = false;
    this._layoutEditMode = false;
    this._dragSlider     = null;   // 현재 드래그 중인 슬라이더 apply 콜백
    this._layoutDrag     = null;   // 배치 편집 중 드래그 대상 ('joystick'|'A'|'B') 또는 null

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
    this._buildPauseButton();
    this._buildPauseOverlay();
    this._buildSettingsOverlay();
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
        this._floorText.setText(`Z${zoneOf(floor)} · F${displayFloor(floor)}`);
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
    if (this._bagOpen || this._shopOpen || this._minimapOpen || this._dialogueOpen
        || this._pauseOpen || this._settingsOpen || this._layoutEditMode) return;
    const { player, attackManager, enemyManager } = this.gameScene ?? {};
    if (player)        this._updateHP(player.hp, player.maxHp, player.isPoisoned);
    if (attackManager) this._updateChargeGauge(attackManager);
    if (enemyManager)  this._coreText.setText(String(enemyManager.coreCount));
    if (attackManager && enemyManager) this._updateBSlot(attackManager, enemyManager);
    if (enemyManager) {
      if (this.gameScene?._endScreenEls) this._bossBarContainer.setVisible(false);
      else this._updateBossHPBar(enemyManager.boss);
    }
  }

  // ── 상단 패널 배경 + 구분선 ─────────────────────────

  _buildTopPanel() {
    // 전체 배경
    this.add.rectangle(0, 0, GAME_W, TOP_H, 0x080810, 0.82).setOrigin(0, 0);
    // 하단 테두리 (게임 플레이 영역과의 경계선)
    this.add.rectangle(0, TOP_H, GAME_W, 2, 0x3366aa, 1).setOrigin(0, 0);
    // 상태 | 맵 구분선
    this.add.rectangle(DIVIDER_X, TOP_H / 2 + 6, 1, TOP_H - 16, 0x334466, 0.9).setOrigin(0.5, 0.5);
    // 구역·층 표시기 (미니맵 상단 위 빈 공간) — 복원 시 저장된 층으로 초기화
    this._floorText = this.add.text(272, 10, `Z${zoneOf(this._currentFloor)} · F${displayFloor(this._currentFloor)}`, {
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

  _updateHP(hp, maxHp, poisoned = false) {
    const r = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    this._hpFill.width = HP_BAR_W * r;
    // 뱀 독 중이면 잔량과 무관하게 보라색(적 독 상태색 0xaa44ff 와 일치)
    this._hpFill.setFillStyle(poisoned ? 0xaa44ff : r > 0.5 ? 0xe63946 : r > 0.25 ? 0xf4a261 : 0xff2222);
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

  /**
   * 미니맵 표시용 격자 셀 좌표 반환. 일반 방은 자기 col/row.
   * 비밀방(col=null)은 부모 방의 비밀문 방향 옆 칸으로 환산(방문 후 표시용). 환산 불가 시 null.
   */
  _mmCell(r, rooms) {
    if (r.col !== null) return { col: r.col, row: r.row };
    const se = r.secretEntry;
    const parent = se ? rooms.find(p => p.id === se.parentId) : null;
    if (!parent || parent.col === null) return null;
    const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[se.fromDir];
    if (!off) return null;
    return { col: parent.col + off[0], row: parent.row + off[1] };
  }

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

    // 비밀방(col=null)은 '던전의 감각' 미리보기에선 숨기고, 방문(visited) 후에만 부모 옆에 표시
    rooms.filter(r => (r.col === null) ? r.visited : (r.visited || mapReveal)).forEach(r => {
      const pos = this._mmCell(r, rooms);
      if (!pos) return;
      const cx = ox + pos.col * MM_CW + MM_CW / 2;
      const cy = oy + pos.row * MM_CH + MM_CH / 2;
      const unvisited = mapReveal && !r.visited;
      const color = r.id === currentId ? 0x4ecca3
        : r.col === null      ? 0x9b59d0
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
    this._mmOverlayTitleText.setText(`ZONE ${zone}${zoneName ? ' · ' + zoneName : ''}   ·   FLOOR ${displayFloor(floor)}`);

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

    // 비밀방(col=null)은 '던전의 감각' 미리보기에선 숨기고, 방문(visited) 후에만 부모 옆에 표시
    rooms.filter(r => (r.col === null) ? r.visited : (r.visited || mapReveal)).forEach(r => {
      const pos = this._mmCell(r, rooms);
      if (!pos) return;
      const cx = ox + pos.col * MM_LARGE_CW + MM_LARGE_CW / 2;
      const cy = oy + pos.row * MM_LARGE_CH + MM_LARGE_CH / 2;
      const isCurrent = r.id === this._currentRoomId;
      const unvisited = mapReveal && !r.visited;
      const isSecret = r.col === null;
      const color = isCurrent           ? 0x4ecca3
        : isSecret            ? 0x9b59d0
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
      if (isSecret)                label = '?';
      else if (r.type === 'start') label = 'S';
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
      { label: '기본 공격력',  value: `${player.baseAttack ?? 10}`,                  enhanced: (player.baseAttack ?? 10) > 10 },
      { label: '체력',         value: `${player.hp}/${player.maxHp}`,                enhanced: player.maxHp > 100 },
      { label: '방어력',       value: `${player.armor ?? 0}`,                        enhanced: (player.armor ?? 0) > 0 },
      { label: '이동속도',     value: `${Math.round(player.baseSpeed)}`,             enhanced: player.baseSpeed > 200 },
      { label: '근거리 피해',  value: mult(player.meleeDamageMult * (1 + (player.hungerDamageBonus?.() ?? 0))), enhanced: player.meleeDamageMult * (1 + (player.hungerDamageBonus?.() ?? 0)) > 1 },
      { label: '근거리 반경',  value: mult(player.meleeRadiusMult),                  enhanced: player.meleeRadiusMult > 1 },
      { label: '충전속도',     value: mult(player.chargeSpeedMult),                  enhanced: player.chargeSpeedMult > 1 },
      { label: '치명타율',     value: pct(player.critRate),                          enhanced: player.critRate > 0.15 },
      { label: '치명타 피해',  value: pct(player.critMult + (player.satietyCritBonus?.() ?? 0)), enhanced: (player.critMult + (player.satietyCritBonus?.() ?? 0)) > 1.5 },
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
        this.add.text(textX, rowY - 6, item.count > 1 ? `${item.name} ×${item.count}` : item.name, {
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
    this._shopMode = 'shop';
    this._shopTitle.setText('GRIM 상점');
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

  /**
   * 코어 제단 오버레이 — 상점 UI 를 재사용. slots 는 GameScene 이 층당 1회 추첨해 캐시한 목록.
   * 슬롯 가격은 baked 하지 않고 _refreshShopCards 에서 현재 누진가(em.altarCost)로 채운다.
   * 구매 시 sold 처리하지 않고 누진 카운터만 올려 반복 구매 가능(가격은 매번 상승).
   */
  openAltar(slots) {
    if (this._shopOpen) return;
    if (!slots) slots = this._rollAltarSlots(1);  // 폴백 (직접 호출 시)
    this._shopMode = 'altar';
    this._shopTitle.setText('코어 제단');
    this._resizeShopPanelForSlots(slots.length);
    this._shopOpen  = true;
    this._shopSlots = slots;
    this._shopStaticEls.forEach(el => el.setVisible(true));
    this._refreshShopCards();
    this.scene.get('GameScene').scene.pause();
  }

  _rollAltarSlots(n) {
    const ids = Object.keys(ALTAR_POOL);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, Math.min(n, ids.length)).map(id => ({
      kind: 'upgrade', id, name: ALTAR_POOL[id].name, desc: ALTAR_POOL[id].desc, cost: 0,
    }));
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
      if (ITEM_DEFS[slot.id]?.stackable) return; // 스택형(코어 결정체)은 보유 중이어도 상시 판매 — 재추첨 안 함
      if (!owned.has(slot.id)) return;
      // 후보: ITEM_DEFS 중 보유하지 않고, 같은 상점의 다른 슬롯이 가지지 않은 일반 패시브 (스택형은 재추첨 대상에서 제외)
      const candidates = Object.keys(ITEM_DEFS)
        .filter(id => !owned.has(id) && !usedInShop.has(id) && !ITEM_DEFS[id].stackable);
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

    // 제단: 모든 슬롯 가격을 현재 누진가로 동기화 (구매 시마다 상승)
    if (this._shopMode === 'altar') {
      const c = em.altarCost();
      this._shopSlots.forEach(s => { s.cost = c; });
    }

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
    // 제단: sold 처리 없이 누진 카운터만 올려 반복 구매 가능 / 상점: 1회성 sold
    if (this._shopMode === 'altar') em.recordAltarPurchase();
    else                            slot.sold = true;
    // 상점 오픈 중에는 update()가 스킵되므로 HP·코어 카운터를 즉시 반영
    this._updateHP(player.hp, player.maxHp, player.isPoisoned);
    this._coreText.setText(String(em.coreCount));
    this._refreshShopCards();
  }

  _applyShopSlot(slot, player) {
    // 코어 제단 강화 (런 한정) — Player 기존 스탯 필드 갱신, serialize 로 자동 보존
    if (slot.kind === 'upgrade')   { ALTAR_POOL[slot.id]?.apply(player); return; }
    // 대식가(big_trap) — healItemMult 로 회복량 ×1.1
    if (slot.kind === 'heal')      { player.heal(Math.max(1, Math.round(slot.amount * player.healItemMult))); return; }
    if (slot.kind === 'heal_pct')  { player.heal(Math.floor(player.maxHp * slot.ratio * player.healItemMult)); return; }
    if (slot.kind === 'heal_full') { player.heal(player.maxHp); return; }
    if (slot.kind === 'item') {
      // 생성 시점에 이미 선정된 패시브 적용 (slot.id 고정).
      // grant 가 효과 적용 + 인벤토리 등록(스택형 count 누적) + 영속 해금을 일괄 처리.
      PassiveItem.grant(player, slot.id);
    }
  }

  _shopName(slot) {
    return slot.name;
  }

  _shopDesc(slot, player) {
    if (slot.kind === 'upgrade')   return slot.desc ?? '';
    if (slot.kind === 'item')      return slot.dynDesc ? slot.dynDesc(player) : (slot.desc ?? '');
    if (slot.kind === 'heal')      return `HP +${slot.amount}`;
    if (slot.kind === 'heal_pct')  return `HP +${Math.floor(player.maxHp * slot.ratio)} (50%)`;
    if (slot.kind === 'heal_full') return 'HP 완전 회복';
    return '';
  }

  _shopIconColor(slot) {
    if (slot.kind === 'upgrade')   return 0x00e5ff;
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
    this._slotTexts = [];
    [
      { label: 'A', color: 0x4ecca3 },
      { label: 'B', color: 0xe63946 },
    ].forEach((slot) => {
      const r = getSlotRadius(slot.label);
      const rect = this.add.circle(0, 0, r, 0x12121f, 0.85)
        .setStrokeStyle(4, slot.color, 1);
      const text = this.add.text(0, 0, slot.label, {
        fontSize: slotFontPx(r), color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        stroke: '#ffffff', strokeThickness: 0.1, // 일반↔볼드 사이 두께: 흰 글자에 얇은 흰 stroke
        resolution: SLOT_TEXT_RES, // Scale.FIT 확대 시 비트맵 뭉개짐 방지 (고해상도로 구움)
      }).setOrigin(0.5);
      this._slotRects.push(rect);
      this._slotTexts.push(text);
    });
    this._layoutSkillSlots();
  }

  /**
   * A/B 슬롯 시각을 현재 위치(getSlotPos)·크기(getSlotRadius)로 배치.
   * 위치·크기 단일 출처(Settings)를 그대로 반영 — 편집 확정 후에도 이 경로로 갱신.
   */
  _layoutSkillSlots() {
    ['A', 'B'].forEach((slot, i) => {
      const c = getSlotPos(slot);
      const r = getSlotRadius(slot);
      this._slotRects[i].setPosition(c.x, c.y).setRadius(r);
      this._slotTexts[i].setPosition(c.x, c.y).setFontSize(slotFontPx(r));
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
      if (this._layoutEditMode)    this._exitLayoutEdit(false);
      else if (this._settingsOpen) this._closeSettings();
      else if (this._bagOpen)      this._closeBag();
      else if (this._shopOpen)     this.closeShop();
      else if (this._minimapOpen)  this._closeMinimap();
      else if (this._dialogueOpen) this.closeDialogue();
      else if (this._pauseOpen)    this._closePause();
      else                         this._openPause();
    });
  }

  _flashSlot(index) {
    const rect = this._slotRects[index];
    if (!rect) return;
    this.tweens.killTweensOf(rect);
    rect.setAlpha(1);
    this.tweens.add({ targets: rect, alpha: 0.8, duration: 200, ease: 'Quad.In' });
  }

  // ── 일시정지 메뉴 ─────────────────────────────────────

  /** HUD 좌상단 ⏸ 버튼 — 터치 환경(ESC 불가)에서 일시정지 메뉴 토글. */
  _buildPauseButton() {
    const cx = 15, cy = 12;
    const btn = this.add.rectangle(cx, cy, 22, 18, 0x0e0e1e)
      .setStrokeStyle(1.5, 0x445588, 0.9).setDepth(60)
      .setInteractive({ cursor: 'pointer' });
    const g = this.add.graphics().setDepth(61);
    g.fillStyle(0x7788bb, 1);
    g.fillRect(cx - 4, cy - 5, 3, 10);
    g.fillRect(cx + 1, cy - 5, 3, 10);
    btn.on('pointerdown', () => { if (this._pauseOpen) this._closePause(); else this._openPause(); });
    btn.on('pointerover', () => btn.setFillStyle(0x1e1e3e));
    btn.on('pointerout',  () => btn.setFillStyle(0x0e0e1e));
  }

  _buildPauseOverlay() {
    const cx = GAME_W / 2, cy = GAME_H / 2;
    const panelW = 280, panelH = 332;

    const backdrop = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.84)
      .setOrigin(0, 0).setDepth(110).setInteractive();
    const panel = this.add.rectangle(cx, cy, panelW, panelH, 0x0c0c18)
      .setStrokeStyle(2, 0x445588, 0.9).setDepth(111).setInteractive();
    const title = this.add.text(cx, cy - panelH / 2 + 30, '일시정지', {
      fontSize: '18px', color: '#99aabb', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(112);

    this._pauseEls = [backdrop, panel, title];

    const mkBtn = (label, oy, lineColor, textColor, onClick) => {
      const r = this.add.rectangle(cx, cy + oy, 210, 46, 0x1a1a2e)
        .setStrokeStyle(2, lineColor).setDepth(112)
        .setInteractive({ cursor: 'pointer' });
      const t = this.add.text(cx, cy + oy, label, {
        fontSize: '15px', color: textColor, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(113);
      r.on('pointerover', () => r.setFillStyle(0x26263e));
      r.on('pointerout',  () => r.setFillStyle(0x1a1a2e));
      r.on('pointerdown', onClick);
      this._pauseEls.push(r, t);
    };

    mkBtn('계속하기',     -64, 0x4ecca3, '#4ecca3', () => this._closePause());
    mkBtn('설정',         -10, 0xddcc66, '#ddcc66', () => this._openSettings());
    mkBtn('저장 후 종료',  44, 0x88aaff, '#88aaff', () => this._saveAndQuit());
    mkBtn('포기',         100, 0xff6666, '#ff6666', () => this._abandonRun());

    this._pauseEls.forEach(el => el.setVisible(false));
  }

  _openPause() {
    if (this._pauseOpen) return;
    this._pauseOpen = true;
    this._pauseEls.forEach(el => el.setVisible(true));
    this.scene.get('GameScene').scene.pause();
  }

  _closePause() {
    if (!this._pauseOpen) return;
    this._pauseOpen = false;
    this._pauseEls.forEach(el => el.setVisible(false));
    this.scene.get('GameScene').scene.resume();
  }

  /** 현재 상태를 저장하고 허브로 — 이어하기로 같은 지점 재개 가능. */
  _saveAndQuit() {
    const gs = this.scene.get('GameScene');
    this._pauseOpen = false;
    this._pauseEls.forEach(el => el.setVisible(false));
    saveRunState(gs);
    gs.scene.stop();              // GameScene 종료
    this.scene.start('HubScene'); // UIScene(self) 종료 + Hub 시작
  }

  /** 런 포기 — 사망과 동일한 결과 정산 화면을 GameScene 에 띄운다(저장본 삭제·보존율 정산은 그 안에서). */
  _abandonRun() {
    const gs = this.scene.get('GameScene');
    this._pauseOpen = false;
    this._pauseEls.forEach(el => el.setVisible(false));
    gs.scene.resume();   // 결과 화면 버튼이 입력을 받도록 씬 재개
    gs.abandonRun();
  }

  // ── 설정 메뉴 ─────────────────────────────────────────
  // 일시정지 메뉴 → '설정' 진입. 배경음/효과음 볼륨·음소거 + 조이스틱 위치 변경.
  // GameScene 은 pause 메뉴 진입 시점에 이미 멈춰 있으므로 여기서 따로 pause 하지 않는다.

  _buildSettingsOverlay() {
    const cx = GAME_W / 2, cy = GAME_H / 2;
    const panelW = 300, panelH = 380;
    const top    = cy - panelH / 2;
    const leftX  = cx - panelW / 2 + 24;
    const rightX = cx + panelW / 2 - 24;
    const sliderW = 168;

    const backdrop = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.86)
      .setOrigin(0, 0).setDepth(115).setInteractive();
    const panel = this.add.rectangle(cx, cy, panelW, panelH, 0x0c0c18)
      .setStrokeStyle(2, 0x445588, 0.9).setDepth(116).setInteractive();
    const title = this.add.text(cx, top + 26, '설정', {
      fontSize: '18px', color: '#99aabb', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(117);
    const closeBtn = this.add.text(cx + panelW / 2 - 18, top + 24, '✕', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(117).setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerdown', () => this._closeSettings());
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#667788'));
    const divider = this.add.rectangle(cx, top + 44, panelW - 24, 1, 0x334466).setDepth(117);

    this._settingsEls = [backdrop, panel, title, closeBtn, divider];

    const sectionLabel = (text, y) => {
      this._settingsEls.push(this.add.text(leftX, y, text, {
        fontSize: '12px', color: '#6688aa', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(117));
    };

    // 배경음 (BGM)
    let y = top + 78;
    sectionLabel('배경음', y);
    this._buildMuteToggle(rightX, y, isBgmMuted(), (m) => setBgmMuted(m));
    this._buildSlider(leftX, y + 26, sliderW, getBgmVolume(), (r) => setBgmVolume(r));

    // 효과음 (SFX)
    y = top + 152;
    sectionLabel('효과음', y);
    this._buildMuteToggle(rightX, y, isSfxMuted(), (m) => setSfxMuted(m));
    this._buildSlider(leftX, y + 26, sliderW, getSfxVolume(), (r) => setSfxVolume(r));

    // 컨트롤러
    y = top + 226;
    sectionLabel('컨트롤러', y);
    this._buildSettingsButton('컨트롤 배치 변경', cx, y + 32, panelW - 48, 0x4ecca3, '#4ecca3',
      () => this._enterLayoutEdit());
    this._buildSettingsButton('배치 초기화', cx, y + 72, panelW - 48, 0x778899, '#aabbcc', () => {
      resetLayout();
      this.gameScene?.input$?.resetBasePosition();
      this._layoutSkillSlots();  // 조이스틱·A·B 모두 기본 위치로 복귀
    });

    this._settingsEls.forEach(el => el.setVisible(false));

    // 슬라이더 thumb / 컨트롤 배치 프록시 드래그용 전역 포인터 핸들러 (1회 등록, 플래그로 가드)
    this.input.on('pointermove', (p) => {
      if (this._dragSlider) this._dragSlider(p.x);
      if (this._layoutDrag) this._moveLayoutProxy(p.x, p.y);
    });
    this.input.on('pointerup', () => {
      this._dragSlider = null;
      this._layoutDrag = null;
    });
  }

  /** 0~1 비율 슬라이더. 트랙/thumb 클릭·드래그로 조절, onChange(ratio) 콜백. */
  _buildSlider(leftX, y, w, initial, onChange) {
    const r0 = Phaser.Math.Clamp(initial, 0, 1);
    const track = this.add.rectangle(leftX, y, w, 6, 0x1a1a2e)
      .setOrigin(0, 0.5).setDepth(117).setInteractive({ cursor: 'pointer' });
    const fill = this.add.rectangle(leftX, y, w * r0, 6, 0x4ecca3)
      .setOrigin(0, 0.5).setDepth(117);
    const thumb = this.add.rectangle(leftX + w * r0, y, 14, 20, 0xddeeff)
      .setOrigin(0.5).setDepth(118).setInteractive({ cursor: 'pointer' });
    const pct = this.add.text(leftX + w + 12, y, Math.round(r0 * 100) + '%', {
      fontSize: '11px', color: '#aabbcc', fontFamily: 'monospace',
    }).setOrigin(0, 0.5).setDepth(117);

    const apply = (px) => {
      const r = Phaser.Math.Clamp((px - leftX) / w, 0, 1);
      fill.width = w * r;
      thumb.x    = leftX + w * r;
      pct.setText(Math.round(r * 100) + '%');
      onChange(r);
    };
    track.on('pointerdown', (p) => { apply(p.x); this._dragSlider = apply; });
    thumb.on('pointerdown', () => { this._dragSlider = apply; });

    this._settingsEls.push(track, fill, thumb, pct);
  }

  /** 음소거 토글 버튼 (우측 정렬). 켜짐(초록) ↔ 음소거(빨강). onToggle(muted) 콜백. */
  _buildMuteToggle(xRight, y, muted, onToggle) {
    const W = 58, H = 22;
    let state = muted;
    const box = this.add.rectangle(xRight, y, W, H, 0x16261a)
      .setOrigin(1, 0.5).setDepth(117).setInteractive({ cursor: 'pointer' });
    const txt = this.add.text(xRight - W / 2, y, '', {
      fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(118);
    const render = () => {
      box.setFillStyle(state ? 0x3a1a1a : 0x16261a);
      box.setStrokeStyle(1.5, state ? 0xcc5555 : 0x4ecca3, 0.9);
      txt.setText(state ? '음소거' : '켜짐').setColor(state ? '#ee8888' : '#88eecc');
    };
    render();
    box.on('pointerdown', () => { state = !state; render(); onToggle(state); });
    this._settingsEls.push(box, txt);
  }

  _buildSettingsButton(label, cx, y, w, lineColor, textColor, onClick) {
    const r = this.add.rectangle(cx, y, w, 34, 0x1a1a2e)
      .setStrokeStyle(2, lineColor).setDepth(117).setInteractive({ cursor: 'pointer' });
    const t = this.add.text(cx, y, label, {
      fontSize: '13px', color: textColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(118);
    r.on('pointerover', () => r.setFillStyle(0x26263e));
    r.on('pointerout',  () => r.setFillStyle(0x1a1a2e));
    r.on('pointerdown', onClick);
    this._settingsEls.push(r, t);
  }

  _openSettings() {
    if (this._settingsOpen) return;
    this._settingsOpen = true;
    this._pauseEls.forEach(el => el.setVisible(false));     // 일시정지 메뉴 가림
    this._settingsEls.forEach(el => el.setVisible(true));
  }

  _closeSettings() {
    if (!this._settingsOpen) return;
    this._settingsOpen = false;
    this._dragSlider = null;
    this._settingsEls.forEach(el => el.setVisible(false));
    this._pauseEls.forEach(el => el.setVisible(true));      // 일시정지 메뉴로 복귀
  }

  // ── 컨트롤 배치 편집 (조이스틱·A·B 자유 드래그) ───────
  // 설정 화면을 잠시 가리고 게임 위에 조이스틱·A·B 프록시를 띄운다. 각 프록시를 독립적으로
  // 드래그해 배치하고, 확인 시 세 위치를 모두 저장한다. 실제 컨트롤은 편집 중 숨겼다가 복원.

  _enterLayoutEdit() {
    const im = this.gameScene?.input$;
    if (!im || this._layoutEditMode) return;
    this._layoutEditMode = true;
    this._settingsEls.forEach(el => el.setVisible(false));

    // 실제 컨트롤 숨김 — 프록시만 보이게
    im.setVisible(false);
    this._slotRects.forEach(r => r.setVisible(false));
    this._slotTexts.forEach(t => t.setVisible(false));

    const cx = GAME_W / 2;
    const joy = { x: im._jx, y: im._jy };
    const a   = getSlotPos('A');
    const b   = getSlotPos('B');

    const backdrop = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.45)
      .setOrigin(0, 0).setDepth(125).setInteractive();
    backdrop.on('pointerdown', (p) => {
      this._layoutDrag = this._pickLayoutTarget(p.x, p.y);
      if (this._layoutDrag) this._moveLayoutProxy(p.x, p.y);
    });

    const hint = this.add.text(cx, 84, '조이스틱·A·B 버튼을 각각\n원하는 위치로 드래그하세요', {
      fontSize: '14px', color: '#ddeeff', fontFamily: 'monospace', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5).setDepth(127);

    // 조이스틱 프록시 (실제 BASE_R/THUMB_R 와 동일 크기)
    const joyBase  = this.add.circle(joy.x, joy.y, 58, 0x4ecca3, 0.18)
      .setStrokeStyle(2, 0x4ecca3, 0.8).setDepth(126);
    const joyThumb = this.add.circle(joy.x, joy.y, 22, 0x4ecca3, 0.85).setDepth(127);

    // A/B 버튼 프록시 (실제 슬롯과 동일 — getSlotRadius 반지름 원형)
    const mkSlotProxy = (label, pos, color, rad) => {
      const rect = this.add.circle(pos.x, pos.y, rad, 0x12121f, 0.92)
        .setStrokeStyle(4, color, 1).setDepth(126);
      const text = this.add.text(pos.x, pos.y, label, {
        fontSize: slotFontPx(rad), color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        stroke: '#ffffff', strokeThickness: 0.1, // 일반↔볼드 사이 두께: 흰 글자에 얇은 흰 stroke
        resolution: SLOT_TEXT_RES,
      }).setOrigin(0.5).setDepth(127);
      return { rect, text };
    };
    const aR = getSlotRadius('A'), bR = getSlotRadius('B');
    const aP = mkSlotProxy('A', a, 0x4ecca3, aR);
    const bP = mkSlotProxy('B', b, 0xe63946, bR);

    this._lp = {
      joy:  { ...joy }, a: { ...a }, b: { ...b }, aSize: aR, bSize: bR,
      joyBase, joyThumb, aRect: aP.rect, aText: aP.text, bRect: bP.rect, bText: bP.text,
      aSlider: null, bSlider: null,
    };
    this._layoutEls = [backdrop, hint, joyBase, joyThumb, aP.rect, aP.text, bP.rect, bP.text];

    // 크기 슬라이더 (상단 hint 아래 — 하단 프록시와 겹치지 않게)
    const sx = cx - 70, sw = 120;
    this._lp.aSlider = this._buildSizeSlider(sx, 138, sw, 'A', 0x4ecca3);
    this._lp.bSlider = this._buildSizeSlider(sx, 174, sw, 'B', 0xe63946);

    const mkBtn = (label, ox, color, tcolor, cb) => {
      const by = GAME_H - 70;
      const r = this.add.rectangle(cx + ox, by, 94, 40, 0x1a1a2e)
        .setStrokeStyle(2, color).setDepth(128).setInteractive({ cursor: 'pointer' });
      const t = this.add.text(cx + ox, by, label, {
        fontSize: '13px', color: tcolor, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(129);
      r.on('pointerover', () => r.setFillStyle(0x26263e));
      r.on('pointerout',  () => r.setFillStyle(0x1a1a2e));
      r.on('pointerdown', cb);
      this._layoutEls.push(r, t);
    };
    mkBtn('취소',  -102, 0xff6666, '#ff6666', () => this._exitLayoutEdit(false));
    mkBtn('초기화',   0, 0x778899, '#aabbcc', () => this._resetLayoutProxies());
    mkBtn('확인',   102, 0x4ecca3, '#4ecca3', () => this._exitLayoutEdit(true));
  }

  /** 포인터 위치에서 가장 가까운(잡기 반경 내) 프록시 대상을 고른다. */
  _pickLayoutTarget(x, y) {
    const targets = [
      { type: 'joystick', x: this._lp.joy.x, y: this._lp.joy.y, r: 58 },
      { type: 'A', x: this._lp.a.x, y: this._lp.a.y, r: Math.max(40, this._lp.aSize + 12) },
      { type: 'B', x: this._lp.b.x, y: this._lp.b.y, r: Math.max(40, this._lp.bSize + 12) },
    ];
    let best = null, bestD = Infinity;
    for (const o of targets) {
      const d = Phaser.Math.Distance.Between(x, y, o.x, o.y);
      if (d <= o.r && d < bestD) { bestD = d; best = o.type; }
    }
    return best;
  }

  _moveLayoutProxy(px, py) {
    const t = this._layoutDrag;
    if (!t) return;
    if (t === 'joystick') {
      const x = Phaser.Math.Clamp(px, 60, GAME_W - 60);
      const y = Phaser.Math.Clamp(py, HUD_H + 70, GAME_H - 70);
      this._lp.joy = { x, y };
      this._lp.joyBase.setPosition(x, y);
      this._lp.joyThumb.setPosition(x, y);
    } else {
      const x = Phaser.Math.Clamp(px, 30, GAME_W - 30);
      const y = Phaser.Math.Clamp(py, HUD_H + 30, GAME_H - 30);
      const rect = t === 'A' ? this._lp.aRect : this._lp.bRect;
      const text = t === 'A' ? this._lp.aText : this._lp.bText;
      rect.setPosition(x, y);
      text.setPosition(x, y);
      this._lp[t === 'A' ? 'a' : 'b'] = { x, y };
    }
  }

  /**
   * 편집 화면용 A/B 크기 슬라이더. 비율 0~1 ↔ 반지름 [SLOT_R_MIN, SLOT_R_MAX] 매핑.
   * 드래그 시 해당 프록시 원·글자·this._lp 크기를 갱신. 요소는 _layoutEls 에 push.
   * { setRatio } 반환 — 초기화에서 thumb 위치 동기화에 사용.
   */
  _buildSizeSlider(leftX, y, w, slot, color) {
    const isA = slot === 'A';
    const r2ratio = (r) => (r - SLOT_R_MIN) / (SLOT_R_MAX - SLOT_R_MIN);
    const r0 = Phaser.Math.Clamp(r2ratio(isA ? this._lp.aSize : this._lp.bSize), 0, 1);

    const label = this.add.text(leftX - 8, y, slot + ' 크기', {
      fontSize: '12px', color: '#aabbcc', fontFamily: 'monospace',
    }).setOrigin(1, 0.5).setDepth(127);
    const track = this.add.rectangle(leftX, y, w, 6, 0x1a1a2e)
      .setOrigin(0, 0.5).setDepth(127).setInteractive({ cursor: 'pointer' });
    const fill = this.add.rectangle(leftX, y, w * r0, 6, color)
      .setOrigin(0, 0.5).setDepth(127);
    const thumb = this.add.rectangle(leftX + w * r0, y, 14, 20, 0xddeeff)
      .setOrigin(0.5).setDepth(128).setInteractive({ cursor: 'pointer' });

    const applyRatio = (r) => {
      fill.width = w * r;
      thumb.x    = leftX + w * r;
      const rad = Math.round(SLOT_R_MIN + (SLOT_R_MAX - SLOT_R_MIN) * r);
      const rect = isA ? this._lp.aRect : this._lp.bRect;
      const text = isA ? this._lp.aText : this._lp.bText;
      rect.setRadius(rad);
      text.setFontSize(slotFontPx(rad));
      if (isA) this._lp.aSize = rad; else this._lp.bSize = rad;
    };
    const apply = (px) => applyRatio(Phaser.Math.Clamp((px - leftX) / w, 0, 1));
    track.on('pointerdown', (p) => { apply(p.x); this._dragSlider = apply; });
    thumb.on('pointerdown', () => { this._dragSlider = apply; });

    // 이 슬롯만 기본 크기로 (슬라이더 옆 개별 초기화)
    const defRatio = (SLOT_R_DEFAULT - SLOT_R_MIN) / (SLOT_R_MAX - SLOT_R_MIN);
    const rbX = leftX + w + 30;
    const rbtn = this.add.rectangle(rbX, y, 44, 22, 0x1a1a2e)
      .setStrokeStyle(1.5, color, 0.9).setDepth(127).setInteractive({ cursor: 'pointer' });
    const rtxt = this.add.text(rbX, y, '기본', {
      fontSize: '11px', color: '#aabbcc', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(128);
    rbtn.on('pointerover', () => rbtn.setFillStyle(0x26263e));
    rbtn.on('pointerout',  () => rbtn.setFillStyle(0x1a1a2e));
    rbtn.on('pointerdown', () => applyRatio(defRatio));

    this._layoutEls.push(label, track, fill, thumb, rbtn, rtxt);
    return { setRatio: applyRatio };
  }

  /** 편집 중 프록시들을 기본 위치로 (저장 전 미리보기). */
  _resetLayoutProxies() {
    const jx = 90, jy = this.scale.height - 130;  // InputManager 기본값(JX=90, JY_FROM_BOTTOM=130)
    this._lp.joy = { x: jx, y: jy };
    this._lp.joyBase.setPosition(jx, jy);
    this._lp.joyThumb.setPosition(jx, jy);
    // 기본 슬롯은 조이스틱 좌측 기준(우측 배치) — getDefaultSlotPos 가 현재 저장값 영향을 받지
    // 않도록, 조이스틱을 좌측 기본으로 되돌린 상태의 기본 위치를 직접 계산해 사용한다.
    [['A', this._lp.aRect, this._lp.aText], ['B', this._lp.bRect, this._lp.bText]].forEach(([slot, rect, text], i) => {
      const x = GAME_W - 20 - 28 - (56 + 10) * i;  // A=342, B=276
      const y = this.scale.height - 130;
      this._lp[slot === 'A' ? 'a' : 'b'] = { x, y };
      rect.setPosition(x, y);
      text.setPosition(x, y);
    });
    // 크기도 기본값으로 — 슬라이더 thumb 동기화(setRatio 가 프록시 원·글자·lp 크기까지 갱신)
    const defRatio = (SLOT_R_DEFAULT - SLOT_R_MIN) / (SLOT_R_MAX - SLOT_R_MIN);
    this._lp.aSlider?.setRatio(defRatio);
    this._lp.bSlider?.setRatio(defRatio);
  }

  _exitLayoutEdit(commit) {
    if (!this._layoutEditMode) return;
    this._layoutEditMode = false;
    this._layoutDrag = null;
    const im = this.gameScene?.input$;

    if (commit) {
      setJoystickPos(this._lp.joy.x, this._lp.joy.y);
      setSlotPos('A', this._lp.a.x, this._lp.a.y);
      setSlotPos('B', this._lp.b.x, this._lp.b.y);
      setSlotSize('A', this._lp.aSize);
      setSlotSize('B', this._lp.bSize);
      im?.setBasePosition(this._lp.joy.x, this._lp.joy.y);
      this._layoutSkillSlots();
    }
    // 취소 시 저장하지 않음 — 실제 컨트롤은 건드린 적 없으므로 그대로 복원만.

    this._layoutEls.forEach(el => { if (el.active) el.destroy(); });
    this._layoutEls = [];
    this._lp = null;

    im?.setVisible(true);
    this._slotRects.forEach(r => r.setVisible(true));
    this._slotTexts.forEach(t => t.setVisible(true));
    this._settingsEls.forEach(el => el.setVisible(true));  // 설정 화면 복귀
  }

  // ── NPC 대화 오버레이 ─────────────────────────────────

  _buildDialogueOverlay() {
    const panelW = GAME_W - 20;
    const panelH = 180;
    const panelX = GAME_W / 2;
    // 하단 마진 = 기본 여백 + max(측정 안전영역, 최소 floor)
    const bottomMargin = DLG_BOTTOM_PAD + Math.max(safeInsetBottom(this), DLG_MIN_BOTTOM);
    const panelY = GAME_H - panelH / 2 - bottomMargin;
    const L = panelX - panelW / 2;
    const T = panelY - panelH / 2;

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

    // "?" 초상화 라벨 — 화자 미상(???) 일 때 초상화 대신 표시
    this._dlgPortraitLabel = this.add.text(L + 34, T + 100, '?', {
      fontSize: '32px', color: '#6688aa', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(92).setVisible(false);

    // 플레이어 초상화 — soma-walk 스프라이트시트 frame 0 (정면 정지)
    this._dlgPortraitPlayer = this.add.image(L + 34, T + 100, 'soma-walk', 0)
      .setDisplaySize(56, 56).setDepth(92).setVisible(false);

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
    this._dlgAdvance = this.add.text(panelX + panelW / 2 - 14, panelY + panelH / 2 - 38, '▼', {
      fontSize: '11px', color: '#4ecca3', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(92);
    this.tweens.add({
      targets: this._dlgAdvance, alpha: { from: 1, to: 0.2 },
      duration: 700, yoyo: true, repeat: -1,
    });

    // 건너뛰기 — 대화창 패널 바깥, 패널 위쪽 우측에 텍스트만(테두리/배경 없음).
    // 이미 본 대사일 때만 노출(openDialogue 에서 토글). 패널보다 위 depth + interactive.
    this._dlgSkip = this.add.text(L + panelW - 5, T - 6, 'SKIP', {
      fontSize: '12px', color: '#88aacc', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(1, 1).setDepth(93).setVisible(false)
      .setInteractive({ useHandCursor: true });
    this._dlgSkip.on('pointerover', () => this._dlgSkip.setColor('#cfe3ff'));
    this._dlgSkip.on('pointerout',  () => this._dlgSkip.setColor('#88aacc'));
    this._dlgSkip.on('pointerdown', (_p, _x, _y, e) => { e?.stopPropagation?.(); this._skipDialogue(); });

    this._dlgStaticEls = [backdrop, this._dlgPanel, this._dlgPortrait, this._dlgName,
                          this._dlgDivider, this._dlgText, this._dlgAdvance];
    this._dlgStaticEls.forEach(el => el.setVisible(false));

    // 열 때마다 안전영역 재측정 후 위치 보정용 — backdrop(전체화면) 제외 전 요소를 델타 이동
    // (_dlgSkip 도 패널과 함께 이동해야 하므로 포함)
    this._dlgPanelY   = panelY;
    this._dlgPanelH   = panelH;
    this._dlgShiftEls = [this._dlgPanel, this._dlgPortrait, this._dlgPortraitLabel,
                         this._dlgPortraitPlayer, this._dlgName,
                         this._dlgDivider, this._dlgText, this._dlgAdvance, this._dlgSkip];
  }

  // 현재 안전영역 기준으로 대화 패널 y 를 재배치 (요소 일괄 델타 이동)
  _repositionDialogue() {
    const desiredY = GAME_H - this._dlgPanelH / 2
      - (DLG_BOTTOM_PAD + Math.max(safeInsetBottom(this), DLG_MIN_BOTTOM));
    const delta = desiredY - this._dlgPanelY;
    if (delta === 0) return;
    this._dlgShiftEls.forEach(el => { el.y += delta; });
    this._dlgPanelY = desiredY;
  }

  openDialogue(lines, onComplete, showSkip = false, speakerName = 'GRIM') {
    if (this._dialogueOpen) return;
    this._dialogueOpen  = true;
    this._dlgLines      = lines;
    this._dlgLineIdx    = 0;
    this._dlgOnComplete = onComplete ?? null;
    this._repositionDialogue();
    this._dlgStaticEls.forEach(el => el.setVisible(true));
    this._dlgAdvance.setVisible(true);
    // 건너뛰기 버튼 — 이미 본 적 있는 대사에서만 노출
    this._dlgSkip.setVisible(!!showSkip);
    // 화자 이름 + 초상화 전환
    this._dlgName.setText(speakerName);
    const unknown = speakerName === '???';
    const isPlayer = speakerName === 'PLAYER';
    this._dlgPortrait.setVisible(!unknown && !isPlayer);
    this._dlgPortraitLabel.setVisible(unknown);
    this._dlgPortraitPlayer.setVisible(isPlayer);
    this._dlgText.setText('');
    this.scene.get('GameScene').scene.pause();
    this._typewriteLine(lines[0]);
  }

  /** 건너뛰기 — 남은 대사를 즉시 닫고 완료 콜백 실행 (마지막 줄 탭과 동일 효과). */
  _skipDialogue() {
    if (!this._dialogueOpen) return;
    const cb = this._dlgOnComplete;
    this.closeDialogue();
    cb?.();
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
        }
      },
    });
  }

  _advanceDialogue() {
    if (!this._dialogueOpen) return;
    // 타이핑 중 탭 → 즉시 전체 표시
    if (this._dlgTyping) {
      if (this._dlgTypeTimer) { this._dlgTypeTimer.remove(); this._dlgTypeTimer = null; }
      this._dlgTyping = false;
      this._dlgText.setText(this._dlgFullText);
      return;
    }
    // 마지막 줄에서 탭 → 대화 종료 + 완료 콜백(상점 오픈). 버튼 선택지 없음.
    if (this._dlgLineIdx >= this._dlgLines.length - 1) {
      const cb = this._dlgOnComplete;
      this.closeDialogue();
      cb?.();
      return;
    }
    // 다음 줄
    this._dlgLineIdx++;
    this._dlgText.setText('');
    this._typewriteLine(this._dlgLines[this._dlgLineIdx]);
  }

  closeDialogue() {
    if (!this._dialogueOpen) return;
    this._dialogueOpen = false;
    if (this._dlgTypeTimer) { this._dlgTypeTimer.remove(); this._dlgTypeTimer = null; }
    this._dlgStaticEls.forEach(el => el.setVisible(false));
    this._dlgSkip.setVisible(false);
    this._dlgAdvance.setVisible(false);  // 닫을 때 진행 표시 ▼ 도 숨김 (잔상 화살표 방지)
    this._dlgPortraitLabel.setVisible(false);
    this._dlgPortraitPlayer.setVisible(false);
    this.scene.get('GameScene').scene.resume();
  }
}
