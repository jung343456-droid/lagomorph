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

// 가방 버튼 (맵 영역 우측)
const BAG_CX = GAME_W - 18;   // = 372
const BAG_CY = 54;
const BAG_W  = 30;
const BAG_H  = 24;

// 보스 HP 바
const BOSS_BAR_W = 300;
const BOSS_BAR_H = 18;

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
    this._shopOpen       = false;
    this._shopCardEls    = [];
    this._shopStaticEls  = [];
    this._shopSlots      = null;

    this._buildTopPanel();
    this._buildChargeGauge();
    this._buildHPBar();
    this._buildCoreCounter();
    this._buildBagButton();
    this._buildSkillSlots();
    this._buildBossHPBar();
    this._buildBagOverlay();
    this._buildShopOverlay();
    this._bindKeys();

    this.scene.get('GameScene').events.on(
      'room-entered',
      ({ roomData, dungeonData }) => this._refreshMinimap(dungeonData, roomData.id),
      this,
    );
    this.scene.get('GameScene').events.on(
      'floor-changed',
      (floor) => { this._floorText.setText(`F${floor}`); },
      this,
    );
  }

  update() {
    if (this._bagOpen || this._shopOpen) return;
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
    // 층 표시기 (미니맵 하단 중앙)
    this._floorText = this.add.text(272, TOP_H - 8, 'F1', {
      fontSize: '10px', color: '#4ecca3', fontFamily: 'monospace',
    }).setOrigin(0.5, 1);
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

    this._mmBg = this.add
      .rectangle(ox - MM_PAD, oy - MM_PAD, totalW + MM_PAD * 2, totalH + MM_PAD * 2, 0x000000, 0.65)
      .setOrigin(0, 0);

    rooms.filter(r => r.visited).forEach(r => {
      const cx = ox + r.col * MM_CW + MM_CW / 2;
      const cy = oy + r.row * MM_CH + MM_CH / 2;
      const color = r.id === currentId ? 0x4ecca3
        : r.type === 'start'  ? 0x888844
        : r.type === 'shop'   ? 0xddcc22
        : r.type === 'boss'   ? (r.cleared ? 0x554444 : 0xff2222)
        : r.cleared           ? 0x445566
        :                       0x664444;

      this._mmCells.push(this.add.rectangle(cx, cy, MM_CW - 2, MM_CH - 2, color));

      const { doors } = r;
      [
        { dir: 'up',    mx: cx,              my: cy - MM_CH / 2 + 1 },
        { dir: 'down',  mx: cx,              my: cy + MM_CH / 2 - 1 },
        { dir: 'left',  mx: cx - MM_CW / 2 + 1, my: cy },
        { dir: 'right', mx: cx + MM_CW / 2 - 1, my: cy },
      ].forEach(({ dir, mx, my }) => {
        if (doors[dir] === null) return;
        this._mmCells.push(this.add.rectangle(mx, my, 2, 2, 0xaaaaaa));
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
    const panelW = 310, panelH = 420;
    const panelX = GAME_W / 2, panelY = GAME_H / 2;

    // 어두운 배경 (클릭 차단)
    const backdrop = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.84)
      .setOrigin(0, 0).setDepth(100)
      .setInteractive();

    // 패널
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0c0c18)
      .setStrokeStyle(2, 0x445588, 0.9).setDepth(101);

    // 상단 타이틀
    const title = this.add.text(panelX, panelY - panelH / 2 + 22, '보유 아이템', {
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

    // ESC: 닫기 힌트
    const hint = this.add.text(panelX, panelY + panelH / 2 - 16, 'ESC 또는 ✕ 로 닫기', {
      fontSize: '10px', color: '#334455', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(102);

    this._bagStaticEls = [backdrop, panel, title, titleLine, closeBtn, hint];
    this._bagStaticEls.forEach(el => el.setVisible(false));
    this._panelY    = panelY;
    this._panelH    = panelH;
    this._panelW    = panelW;
    this._panelX    = panelX;
  }

  _openBag() {
    this._bagOpen = true;
    this._bagStaticEls.forEach(el => el.setVisible(true));
    this._refreshItemList();
    this.scene.get('GameScene').scene.pause();
  }

  _closeBag() {
    this._bagOpen = false;
    this._bagStaticEls.forEach(el => el.setVisible(false));
    this._bagItemEls.forEach(el => { if (el.active) el.destroy(); });
    this._bagItemEls = [];
    this.scene.get('GameScene').scene.resume();
  }

  _refreshItemList() {
    this._bagItemEls.forEach(el => { if (el.active) el.destroy(); });
    this._bagItemEls = [];

    const items    = this.gameScene?.player?.inventory ?? [];
    const startY   = this._panelY - this._panelH / 2 + 58;
    const iconX    = this._panelX - this._panelW / 2 + 28;
    const textX    = iconX + 24;
    const rowH     = 52;

    if (items.length === 0) {
      const t = this.add.text(this._panelX, this._panelY, '보유 아이템 없음', {
        fontSize: '13px', color: '#445566', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(102);
      this._bagItemEls.push(t);
      return;
    }

    items.forEach((item, i) => {
      const rowY = startY + i * rowH + rowH / 2;

      const icon = this.add.rectangle(iconX, rowY, 20, 20, item.color)
        .setOrigin(0.5).setDepth(102);

      const name = this.add.text(textX, rowY - 8, item.name, {
        fontSize: '13px', color: '#ddeeff', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(102);

      const desc = this.add.text(textX, rowY + 10, item.desc ?? '', {
        fontSize: '10px', color: '#7788aa', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(102);

      // 행 구분선 (마지막 제외)
      if (i < items.length - 1) {
        const sep = this.add.rectangle(
          this._panelX, rowY + rowH / 2,
          this._panelW - 24, 1, 0x1e2030,
        ).setDepth(102);
        this._bagItemEls.push(sep);
      }

      this._bagItemEls.push(icon, name, desc);
    });
  }

  // ── 상점 오버레이 ────────────────────────────────────

  _buildShopOverlay() {
    const panelW = 320, panelH = 460;
    const panelX = GAME_W / 2, panelY = GAME_H / 2;

    // 어두운 배경 (클릭 차단)
    const backdrop = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.75)
      .setOrigin(0, 0).setDepth(100).setInteractive();

    // 패널
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x18120c)
      .setStrokeStyle(2, 0xddaa44, 0.9).setDepth(101);

    // 상단 타이틀 + GRIM 라벨
    const title = this.add.text(panelX - panelW / 2 + 20, panelY - panelH / 2 + 22, 'GRIM 상점', {
      fontSize: '16px', color: '#ffcc66', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(102);

    // 보유 코어 라벨
    this._shopCoreText = this.add.text(panelX + panelW / 2 - 38, panelY - panelH / 2 + 22, '◆ 0', {
      fontSize: '14px', color: '#00e5ff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(102);

    // 닫기 버튼
    const closeBtn = this.add.text(panelX + panelW / 2 - 16, panelY - panelH / 2 + 22, '✕', {
      fontSize: '16px', color: '#aa8866', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(102).setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerdown', () => this.closeShop());
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#aa8866'));

    // 타이틀 하단 구분선
    const titleLine = this.add.rectangle(panelX, panelY - panelH / 2 + 42, panelW - 24, 1, 0x553322)
      .setDepth(102);

    // 하단 힌트
    const hint = this.add.text(panelX, panelY + panelH / 2 - 14, 'ESC 또는 ✕ 로 닫기', {
      fontSize: '10px', color: '#553322', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(102);

    this._shopStaticEls = [backdrop, panel, title, this._shopCoreText, closeBtn, titleLine, hint];
    this._shopStaticEls.forEach(el => el.setVisible(false));

    this._shopPanelX = panelX;
    this._shopPanelY = panelY;
    this._shopPanelW = panelW;
    this._shopPanelH = panelH;
  }

  openShop(slots) {
    if (this._shopOpen || !slots) return;
    this._shopOpen   = true;
    this._shopSlots  = slots;
    this._shopStaticEls.forEach(el => el.setVisible(true));
    this._refreshShopCards();
    this.scene.get('GameScene').scene.pause();
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
    this._refreshShopCards();
  }

  _applyShopSlot(slot, player) {
    if (slot.kind === 'heal')      { player.heal(slot.amount); return; }
    if (slot.kind === 'heal_pct')  { player.heal(Math.floor(player.maxHp * slot.ratio)); return; }
    if (slot.kind === 'heal_full') { player.heal(player.maxHp); return; }
    if (slot.kind === 'item') {
      // 생성 시점에 이미 선정된 패시브 적용 (slot.id 고정)
      const def = ITEM_DEFS[slot.id];
      def.apply(player);
      player.inventory.push({ name: def.name, color: def.color, desc: def.desc });
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
    if (slot.kind === 'item')      return slot.desc ?? '';
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

    const label = this.add.text(cx, y - 16, 'FANG', {
      fontSize: '13px', color: '#ff4444', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    const bg   = this.add.rectangle(cx, y, BOSS_BAR_W, BOSS_BAR_H, 0x2a0000).setOrigin(0.5, 0.5);
    this._bossHpFill = this.add.rectangle(
      cx - BOSS_BAR_W / 2, y, BOSS_BAR_W, BOSS_BAR_H, 0xff2222,
    ).setOrigin(0, 0.5);
    const border = this.add.rectangle(cx, y, BOSS_BAR_W, BOSS_BAR_H)
      .setStrokeStyle(2, 0xff4444, 0.8).setFillStyle(0x000000, 0);

    this._bossBarContainer.add([label, bg, this._bossHpFill, border]);
  }

  _updateBossHPBar(boss) {
    if (!boss || !boss.alive) { this._bossBarContainer.setVisible(false); return; }
    this._bossBarContainer.setVisible(true);
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
    zKey.on('down', () => this._flashSlot(0));
    xKey.on('down', () => this._flashSlot(1));
    iKey.on('down', () => { if (this._bagOpen) this._closeBag(); else this._openBag(); });
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._bagOpen)       this._closeBag();
      else if (this._shopOpen) this.closeShop();
    });
  }

  _flashSlot(index) {
    const rect = this._slotRects[index];
    if (!rect) return;
    this.tweens.killTweensOf(rect);
    rect.setAlpha(1);
    this.tweens.add({ targets: rect, alpha: 0.8, duration: 200, ease: 'Quad.In' });
  }
}
