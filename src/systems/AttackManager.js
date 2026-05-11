import Phaser from 'phaser';

const MAX_CHARGE = 0.8;
const BASE_DMG   = 10;
const BASE_R     = 60;

const MELEE_TIERS = [
  { threshold: 0,   color: 0x4ecca3, label: '근거리 I',   damage: BASE_DMG,              radius: BASE_R       },
  { threshold: 0.3, color: 0x88eecc, label: '근거리 II',  damage: (BASE_DMG * 1.2) | 0,  radius: BASE_R * 1.2 },
  { threshold: 0.8, color: 0xffffff, label: '근거리 MAX', damage: (BASE_DMG * 1.4) | 0,  radius: BASE_R * 1.5 },
];

const POOP_COST     = 3;
const POOP_COOLDOWN = 1.5;
const POOP_DMG      = 30;
const POOP_SIZE     = 22;
const MAX_POOPS     = 3;
const POOP_COLOR    = 0x7B3F20;

const FOX_KNOCKBACK_PER_DMG = 12;
const FOX_KNOCKBACK_DUR     = 0.22;

// UIScene._buildSkillSlots 와 동일한 레이아웃 상수
const SLOT_SIZE = 56, SLOT_GAP = 10, UI_MARGIN = 20;
const B_CX = 390 - UI_MARGIN - SLOT_SIZE / 2 - (SLOT_SIZE + SLOT_GAP); // 276

export default class AttackManager {
  constructor(scene, player) {
    this.scene  = scene;
    this.player = player;

    // UIScene 이 읽는 공개 상태
    this.isCharging          = false;
    this.chargeNormalized    = 0;
    this.currentTier         = 0;
    this.tierColor           = MELEE_TIERS[0].color;
    this.tierLabel           = '';
    this.bCooldownNormalized = 0;

    // 근거리(A/Z) 충전 상태
    this._mCharging   = false;
    this._mChargeTime = 0;
    this._mPointerId  = null;
    this._mKeydown    = false;
    this._mAimDir     = { x: 1, y: 0 };

    // 설치형(B/X) 상태
    this._bCooldown = 0;
    this._poops     = [];
    this._poopGroup = scene.physics.add.group();

    this._previewGfx = scene.add.graphics().setDepth(30);

    scene.physics.add.overlap(
      this._poopGroup,
      scene.enemyManager.foxGroup,
      this._onPoopHitFox,
      null,
      this,
    );

    scene.events.on('room-entered', () => {
      this._poops.forEach(p => { if (p.go.active) this._poopGroup.remove(p.go, true, true); });
      this._poops = [];
      this._bCooldown          = 0;
      this.bCooldownNormalized = 0;
    }, this);

    this._bindPointers();
    this._bindKeyboard();
  }

  // ── public ──────────────────────────────────────────

  update(delta) {
    const dt = delta / 1000;

    // 쿨다운 감소
    if (this._bCooldown > 0) {
      this._bCooldown          = Math.max(0, this._bCooldown - dt);
      this.bCooldownNormalized = this._bCooldown / POOP_COOLDOWN;
    } else {
      this.bCooldownNormalized = 0;
    }

    if (this._mCharging) {
      if (this._mKeydown) {
        this._mAimDir.x = this.player.facingDir.x;
        this._mAimDir.y = this.player.facingDir.y;
      }
      this._mChargeTime    += dt;
      this.isCharging       = true;
      this.chargeNormalized = Math.min(this._mChargeTime / MAX_CHARGE, 1);
      this.currentTier      = this._calcTier(this._mChargeTime, MELEE_TIERS);
      this.tierColor        = MELEE_TIERS[this.currentTier].color;
      this.tierLabel        = MELEE_TIERS[this.currentTier].label;
      this._drawMeleePreview();

    } else if (this.isCharging) {
      this.isCharging       = false;
      this.chargeNormalized = 0;
      this.currentTier      = 0;
      this.tierLabel        = '';
      this._previewGfx.clear();
    }
  }

  destroy() {
    this._previewGfx.destroy();
    this._poops.forEach(p => { if (p.go.active) p.go.destroy(); });
    this._poops = [];
    const i = this.scene.input;
    i.off('pointerdown', this._onDown, this);
    i.off('pointermove', this._onMove, this);
    i.off('pointerup',   this._onUp,   this);
    if (this._zKey) this._zKey.destroy();
    if (this._xKey) this._xKey.destroy();
  }

  // ── 포인터 바인딩 ────────────────────────────────────

  _bindPointers() {
    const halfW = this.scene.scale.width / 2;

    this._onDown = (p) => {
      if (this._inBSlot(p)) {
        this._startPlace();
      } else {
        if (p.x <= halfW || this._mCharging) return;
        this._mPointerId  = p.id;
        this._mCharging   = true;
        this._mChargeTime = 0;
        this._updateAimDir(p, this._mAimDir);
      }
    };

    this._onMove = (p) => {
      if (p.id === this._mPointerId) this._updateAimDir(p, this._mAimDir);
    };

    this._onUp = (p) => {
      if (p.id === this._mPointerId) { this._fireMelee(); this._stopMelee(); }
    };

    const i = this.scene.input;
    i.on('pointerdown', this._onDown, this);
    i.on('pointermove', this._onMove, this);
    i.on('pointerup',   this._onUp,   this);
  }

  _bindKeyboard() {
    this._zKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this._xKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    this._zKey.on('down', () => {
      if (this._mCharging) return;
      this._mKeydown    = true;
      this._mCharging   = true;
      this._mChargeTime = 0;
    });
    this._zKey.on('up', () => {
      if (!this._mKeydown) return;
      this._mKeydown  = false;
      this._mAimDir.x = this.player.facingDir.x;
      this._mAimDir.y = this.player.facingDir.y;
      this._fireMelee();
      this._stopMelee();
    });

    this._xKey.on('down', () => this._startPlace());
  }

  _updateAimDir(pointer, dir) {
    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const dx = wp.x - this.player.x;
    const dy = wp.y - this.player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) { dir.x = dx / len; dir.y = dy / len; }
  }

  _inBSlot(p) {
    const bCY = this.scene.scale.height - 130; // 조이스틱과 같은 높이
    return Math.abs(p.x - B_CX) <= SLOT_SIZE / 2 && Math.abs(p.y - bCY) <= SLOT_SIZE / 2;
  }

  // ── 근거리 공격 (A / Z) ──────────────────────────────

  _fireMelee() {
    const tier = MELEE_TIERS[this._calcTier(this._mChargeTime, MELEE_TIERS)];
    const { x: px, y: py } = this.player;

    this.scene.events.emit('attack-fired', {
      tierData: { shape: 'circle', radius: tier.radius, damage: tier.damage },
      playerX: px, playerY: py,
      aimDir:  { ...this._mAimDir },
    });

    this._spawnRing(px, py, tier.color, tier.radius);
  }

  _stopMelee() {
    this._mCharging   = false;
    this._mChargeTime = 0;
    this._mPointerId  = null;
    this._previewGfx.clear();
  }

  _drawMeleePreview() {
    const tier  = MELEE_TIERS[this.currentTier];
    const { x: px, y: py } = this.player;
    const pulse = 0.22 + 0.08 * Math.sin(this._mChargeTime * 12);
    this._previewGfx.clear();
    this._previewGfx.fillStyle(tier.color, pulse);
    this._previewGfx.lineStyle(2, tier.color, pulse + 0.3);
    this._previewGfx.fillCircle(px, py, tier.radius);
    this._previewGfx.strokeCircle(px, py, tier.radius);
  }

  // ── 설치형 공격 (B / X) ─────────────────────────────

  _startPlace() {
    const em = this.scene.enemyManager;
    if (this._bCooldown > 0)           return;
    if (this._poops.length >= MAX_POOPS) return;
    if (em.coreCount < POOP_COST)      return;

    em.coreCount -= POOP_COST;
    this._placePoop();
    this._bCooldown          = POOP_COOLDOWN;
    this.bCooldownNormalized = 1;
  }

  _placePoop() {
    const { x: px, y: py } = this.player;
    const go = this.scene.add.rectangle(px, py, POOP_SIZE, POOP_SIZE, POOP_COLOR);
    go.setDepth(5);
    this.scene.physics.add.existing(go, true);
    this._poops.push({ go, damage: POOP_DMG });
    this._poopGroup.add(go);
    this._spawnRing(px, py, POOP_COLOR, POOP_SIZE * 2);
  }

  _onPoopHitFox(poopGO, foxGO) {
    if (!poopGO.active) return;
    const poop = this._poops.find(p => p.go === poopGO);
    if (!poop) return;

    const em  = this.scene.enemyManager;
    const fox = em.foxes.find(f => f.gameObject === foxGO);
    if (!fox || !fox.alive) return;

    const ddx = foxGO.x - poopGO.x;
    const ddy = foxGO.y - poopGO.y;
    const len = Math.sqrt(ddx * ddx + ddy * ddy);
    const nx  = len > 0 ? ddx / len : 1;
    const ny  = len > 0 ? ddy / len : 0;
    const dead = fox.takeDamage(poop.damage, {
      dx: nx, dy: ny,
      force: poop.damage * FOX_KNOCKBACK_PER_DMG,
      duration: FOX_KNOCKBACK_DUR,
    });
    if (dead) em.dropCores(fox.x, fox.y, 3);

    this._destroyPoop(poop);
  }

  _destroyPoop(poop) {
    const idx = this._poops.indexOf(poop);
    if (idx === -1) return;
    this._poops.splice(idx, 1);
    if (!poop.go.active) return;
    this._spawnRing(poop.go.x, poop.go.y, POOP_COLOR, POOP_SIZE * 3);
    this._poopGroup.remove(poop.go, true, true);
  }

  // ── 유틸 ─────────────────────────────────────────────

  _calcTier(t, tiers) {
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (t >= tiers[i].threshold) return i;
    }
    return 0;
  }

  _spawnRing(wx, wy, color, maxR) {
    const gfx   = this.scene.add.graphics().setDepth(50);
    const state = { r: 8, a: 0.9 };
    this.scene.tweens.add({
      targets: state, r: maxR, a: 0,
      duration: 380, ease: 'Cubic.Out',
      onUpdate: () => {
        gfx.clear();
        gfx.lineStyle(3, color, state.a);
        gfx.strokeCircle(wx, wy, state.r);
      },
      onComplete: () => gfx.destroy(),
    });
  }
}
