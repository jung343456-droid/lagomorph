import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../main';

const HP_BAR_W = 180;
const HP_BAR_H = 14;
const MARGIN   = 20;

const BOSS_BAR_W = 300;
const BOSS_BAR_H = 18;

const CHARGE_W  = 200;
const CHARGE_H  = 10;
const CHARGE_Y  = 22;
const TIER1_POS = CHARGE_W * (0.3 / 0.8);

// 미니맵
const MM_CW = 13;  // cell width
const MM_CH = 9;   // cell height
const MM_PAD = 2;

export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    this._prevTier  = 0;
    this._mmCells   = [];
    this._mmBg      = null;
    this._slotRects = [];

    this._buildChargeGauge();
    this._buildHPBar();
    this._buildCoreCounter();
    this._buildSkillSlots();
    this._buildBossHPBar();
    this._bindSkillKeys();

    // 방 진입 이벤트 수신 (GameScene 이벤트 버스에 연결)
    this.scene.get('GameScene').events.on(
      'room-entered',
      ({ roomData, dungeonData }) => this._refreshMinimap(dungeonData, roomData.id),
      this,
    );
  }

  update() {
    const { player, attackManager, enemyManager } = this.gameScene ?? {};
    if (player)        this._updateHP(player.hp, player.maxHp);
    if (attackManager) this._updateChargeGauge(attackManager);
    if (enemyManager)  this._coreText.setText(String(enemyManager.coreCount));
    if (attackManager && enemyManager) this._updateBSlot(attackManager, enemyManager);
    if (enemyManager)  this._updateBossHPBar(enemyManager.boss);
  }

  // ── 충전 게이지 (상단 중앙) ──────────────────────────

  _buildChargeGauge() {
    const cx = GAME_W / 2;
    this.add.rectangle(cx, CHARGE_Y, CHARGE_W, CHARGE_H, 0x1e1e1e).setOrigin(0.5, 0.5);
    this._cgFill = this.add
      .rectangle(cx - CHARGE_W / 2, CHARGE_Y, 0, CHARGE_H, 0x4ecca3)
      .setOrigin(0, 0.5);
    this.add
      .rectangle(cx - CHARGE_W / 2 + TIER1_POS, CHARGE_Y, 2, CHARGE_H + 6, 0x555555)
      .setOrigin(0.5, 0.5);
    this._cgLabel = this.add
      .text(cx + CHARGE_W / 2 + 10, CHARGE_Y, '', {
        fontSize: '11px', color: '#888888', fontFamily: 'monospace',
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

  // ── HP 바 (좌상단) ───────────────────────────────────

  _buildHPBar() {
    const x = MARGIN, y = 60;
    this.add.text(x, y - 16, 'HP', { fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace' });
    this.add.rectangle(x, y, HP_BAR_W, HP_BAR_H, 0x2a2a2a).setOrigin(0, 0);
    this._hpFill = this.add.rectangle(x, y, HP_BAR_W, HP_BAR_H, 0xe63946).setOrigin(0, 0);
    this._hpText = this.add.text(x + HP_BAR_W + 8, y + HP_BAR_H / 2, '100 / 100', {
      fontSize: '11px', color: '#dddddd', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
  }

  _updateHP(hp, maxHp) {
    const r = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    this._hpFill.width = HP_BAR_W * r;
    this._hpFill.setFillStyle(r > 0.5 ? 0xe63946 : r > 0.25 ? 0xf4a261 : 0xff0000);
    this._hpText.setText(`${hp} / ${maxHp}`);
  }

  // ── 코어 카운터 (우상단 HP 줄 기준) ─────────────────

  _buildCoreCounter() {
    const rx = GAME_W - MARGIN, y = 60 + HP_BAR_H / 2;
    this.add.circle(rx - 58, y, 6, 0x00e5ff).setOrigin(0.5);
    this._coreText = this.add.text(rx - 46, y, '0', {
      fontSize: '13px', color: '#00e5ff', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
  }

  // ── 미니맵 (우상단, 코어 위) ─────────────────────────

  _refreshMinimap(dungeonData, currentId) {
    // 기존 셀 삭제
    this._mmCells.forEach(c => c?.destroy());
    this._mmCells = [];
    if (this._mmBg) { this._mmBg.destroy(); this._mmBg = null; }

    const { rooms, gridCols, gridRows } = dungeonData;
    const totalW = gridCols * MM_CW;
    const totalH = gridRows * MM_CH;
    const ox = GAME_W - MARGIN - totalW;
    const oy = 80 + HP_BAR_H + 10;

    // 배경
    this._mmBg = this.add
      .rectangle(ox - MM_PAD, oy - MM_PAD, totalW + MM_PAD * 2, totalH + MM_PAD * 2, 0x000000, 0.7)
      .setOrigin(0, 0);

    // 방문한 방만 표시
    rooms.filter(r => r.visited).forEach(r => {
      const cx = ox + r.col * MM_CW + MM_CW / 2;
      const cy = oy + r.row * MM_CH + MM_CH / 2;
      const color = r.id === currentId
        ? 0x4ecca3                 // 현재 방: 청록
        : r.type === 'start'
          ? 0x888844               // 시작방: 노란빛
          : r.type === 'boss'
            ? (r.cleared ? 0x554444 : 0xff2222) // 보스방: 빨강/클리어 후 어둡게
            : r.cleared
              ? 0x445566           // 클리어: 어두운 파랑
              : 0x664444;          // 미클리어: 어두운 빨강

      const cell = this.add.rectangle(cx, cy, MM_CW - 2, MM_CH - 2, color);
      this._mmCells.push(cell);

      // 문 방향 표시 (연결된 방향에 1px 선)
      const { doors } = r;
      const markers = [
        { dir: 'up',    mx: cx,          my: cy - MM_CH / 2 + 1 },
        { dir: 'down',  mx: cx,          my: cy + MM_CH / 2 - 1 },
        { dir: 'left',  mx: cx - MM_CW / 2 + 1, my: cy },
        { dir: 'right', mx: cx + MM_CW / 2 - 1, my: cy },
      ];
      markers.forEach(({ dir, mx, my }) => {
        if (doors[dir] === null) return;
        const dot = this.add.rectangle(mx, my, 2, 2, 0xaaaaaa);
        this._mmCells.push(dot);
      });
    });
  }

  // ── 보스 HP 바 (하단 중앙) ──────────────────────────

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
    if (!boss || !boss.alive) {
      this._bossBarContainer.setVisible(false);
      return;
    }
    this._bossBarContainer.setVisible(true);
    const r = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1);
    this._bossHpFill.width = BOSS_BAR_W * r;
    this._bossHpFill.setFillStyle(r > 0.5 ? 0xff2222 : 0xff6600);
  }

  // ── 스킬 슬롯 (우하단) ──────────────────────────────

  _buildSkillSlots() {
    const slotSize = 56, gap = 10;
    const slotCY   = this.scale.height - 130; // 조이스틱과 같은 높이
    const rightX   = GAME_W - MARGIN;
    [
      { label: 'A', color: 0x4ecca3 },
      { label: 'B', color: 0xe63946 },
    ].forEach((slot, i) => {
      const x = rightX - slotSize / 2 - (slotSize + gap) * i;
      const y = slotCY;
      const rect = this.add.rectangle(x, y, slotSize, slotSize, 0x1a1a2e, 0.8).setStrokeStyle(2, slot.color, 0.6);
      this._slotRects.push(rect);
      this.add.text(x, y, slot.label, {
        fontSize: '20px', color: '#' + slot.color.toString(16).padStart(6, '0'), fontFamily: 'monospace',
      }).setOrigin(0.5);
    });
  }

  _bindSkillKeys() {
    const zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    const xKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    zKey.on('down', () => this._flashSlot(0));
    xKey.on('down', () => this._flashSlot(1));
  }

  _flashSlot(index) {
    const rect = this._slotRects[index];
    if (!rect) return;
    this.tweens.killTweensOf(rect);
    rect.setAlpha(1);
    this.tweens.add({ targets: rect, alpha: 0.8, duration: 200, ease: 'Quad.In' });
  }

  _updateBSlot(atk, em) {
    const bSlot  = this._slotRects[1];
    if (!bSlot) return;
    const avail = atk.bCooldownNormalized === 0 && em.coreCount >= 3;
    bSlot.setAlpha(avail ? 0.8 : 0.35);
  }
}
