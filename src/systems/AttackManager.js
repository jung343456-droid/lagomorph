import Phaser from 'phaser';
import { ROOM_W, ROOM_H } from '../world/Room';

const MAX_CHARGE = 0.8;
const PROJ_SPEED = 450;
const BASE_DMG   = 20;
const BASE_R     = 60;

const MELEE_TIERS = [
  { threshold: 0,   color: 0x4ecca3, label: '근거리 I',   damage: BASE_DMG,              radius: BASE_R       },
  { threshold: 0.3, color: 0x88eecc, label: '근거리 II',  damage: (BASE_DMG * 1.2) | 0,  radius: BASE_R * 1.2 },
  { threshold: 0.8, color: 0xffffff, label: '근거리 MAX', damage: (BASE_DMG * 1.4) | 0,  radius: BASE_R * 1.5 },
];

const RANGED_TIERS = [
  { threshold: 0,   color: 0xe63946, label: '원거리 I',   damage: (BASE_DMG * 0.5) | 0,  size: 7  },
  { threshold: 0.3, color: 0xff6644, label: '원거리 II',  damage: (BASE_DMG * 0.7) | 0,  size: 9  },
  { threshold: 0.8, color: 0xff2222, label: '원거리 MAX', damage: BASE_DMG,               size: 12 },
];

// UIScene._buildSkillSlots 와 동일한 레이아웃 상수
const SLOT_SIZE = 56, SLOT_GAP = 10, UI_MARGIN = 20;
const B_CX = 390 - UI_MARGIN - SLOT_SIZE / 2 - (SLOT_SIZE + SLOT_GAP); // 276

export default class AttackManager {
  constructor(scene, player) {
    this.scene  = scene;
    this.player = player;

    // UIScene 이 읽는 공개 상태
    this.isCharging       = false;
    this.chargeNormalized = 0;
    this.currentTier      = 0;
    this.tierColor        = MELEE_TIERS[0].color;
    this.tierLabel        = '';

    // 근거리(A/Z) 충전 상태
    this._mCharging   = false;
    this._mChargeTime = 0;
    this._mPointerId  = null;
    this._mKeydown    = false;
    this._mAimDir     = { x: 1, y: 0 };

    // 원거리(B/X) 충전 상태
    this._rCharging   = false;
    this._rChargeTime = 0;
    this._rPointerId  = null;
    this._rKeydown    = false;
    this._rAimDir     = { x: 1, y: 0 };

    // 투사체
    this._projectiles  = [];
    this._projGroup    = scene.physics.add.group();
    this._wallCollider = null;

    this._previewGfx = scene.add.graphics().setDepth(30);

    // foxGroup 은 방이 바뀌어도 동일 객체 → 한 번만 등록
    scene.physics.add.overlap(
      this._projGroup,
      scene.enemyManager.foxGroup,
      this._onProjHitFox,
      null,
      this,
    );

    scene.events.on('room-entered', this._setupWallCollider, this);

    this._bindPointers();
    this._bindKeyboard();
  }

  // ── public ──────────────────────────────────────────

  update(delta) {
    const dt = delta / 1000;

    this._tickProjectiles();

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

    } else if (this._rCharging) {
      if (this._rKeydown) {
        this._rAimDir.x = this.player.facingDir.x;
        this._rAimDir.y = this.player.facingDir.y;
      }
      this._rChargeTime    += dt;
      this.isCharging       = true;
      this.chargeNormalized = Math.min(this._rChargeTime / MAX_CHARGE, 1);
      this.currentTier      = this._calcTier(this._rChargeTime, RANGED_TIERS);
      this.tierColor        = RANGED_TIERS[this.currentTier].color;
      this.tierLabel        = RANGED_TIERS[this.currentTier].label;
      this._drawRangedPreview();

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
    if (this._wallCollider) this._wallCollider.destroy();
    this.scene.events.off('room-entered', this._setupWallCollider, this);
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
        if (this._rCharging) return;
        this._rPointerId  = p.id;
        this._rCharging   = true;
        this._rChargeTime = 0;
        this._updateAimDir(p, this._rAimDir);
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
      if (p.id === this._rPointerId) this._updateAimDir(p, this._rAimDir);
    };

    this._onUp = (p) => {
      if (p.id === this._mPointerId)      { this._fireMelee();  this._stopMelee();  }
      else if (p.id === this._rPointerId) { this._fireRanged(); this._stopRanged(); }
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

    this._xKey.on('down', () => {
      if (this._rCharging) return;
      this._rKeydown    = true;
      this._rCharging   = true;
      this._rChargeTime = 0;
    });
    this._xKey.on('up', () => {
      if (!this._rKeydown) return;
      this._rKeydown  = false;
      this._rAimDir.x = this.player.facingDir.x;
      this._rAimDir.y = this.player.facingDir.y;
      this._fireRanged();
      this._stopRanged();
    });
  }

  _updateAimDir(pointer, dir) {
    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const dx = wp.x - this.player.x;
    const dy = wp.y - this.player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) { dir.x = dx / len; dir.y = dy / len; }
  }

  _inBSlot(p) {
    const bCY = this.scene.scale.height - UI_MARGIN - SLOT_SIZE / 2;
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

  // ── 원거리 공격 (B / X) ──────────────────────────────

  _fireRanged() {
    const tier = RANGED_TIERS[this._calcTier(this._rChargeTime, RANGED_TIERS)];
    const { x: px, y: py } = this.player;

    const d  = tier.size * 2;
    const go = this.scene.add.rectangle(px, py, d, d, tier.color);
    go.setDepth(20);
    this.scene.physics.add.existing(go);
    go.body.setVelocity(this._rAimDir.x * PROJ_SPEED, this._rAimDir.y * PROJ_SPEED);

    const proj = { go, damage: tier.damage, color: tier.color, size: tier.size };
    this._projectiles.push(proj);
    this._projGroup.add(go);
  }

  _stopRanged() {
    this._rCharging   = false;
    this._rChargeTime = 0;
    this._rPointerId  = null;
    this._previewGfx.clear();
  }

  _drawRangedPreview() {
    const tier   = RANGED_TIERS[this.currentTier];
    const aimDir = this._rKeydown ? this.player.facingDir : this._rAimDir;
    const { x: px, y: py } = this.player;
    const { x: dx, y: dy } = aimDir;
    const pulse = 0.22 + 0.08 * Math.sin(this._rChargeTime * 12);
    this._previewGfx.clear();
    this._previewGfx.lineStyle(2, tier.color, pulse + 0.2);
    this._previewGfx.beginPath();
    this._previewGfx.moveTo(px, py);
    this._previewGfx.lineTo(px + dx * 220, py + dy * 220);
    this._previewGfx.strokePath();
    this._previewGfx.fillStyle(tier.color, pulse + 0.15);
    this._previewGfx.fillCircle(px + dx * 40, py + dy * 40, tier.size);
  }

  // ── 투사체 관리 ──────────────────────────────────────

  _setupWallCollider() {
    // 방 전환 시 이전 방 투사체 정리
    this._projectiles.forEach(proj => {
      if (proj.go.active) this._projGroup.remove(proj.go, true, true);
    });
    this._projectiles = [];

    if (this._wallCollider) { this._wallCollider.destroy(); this._wallCollider = null; }
    const wg = this.scene.roomManager?._room?.wallGroup;
    if (!wg) return;

    this._wallCollider = this.scene.physics.add.collider(
      this._projGroup,
      wg,
      (projGO) => {
        const proj = this._projectiles.find(p => p.go === projGO);
        if (proj) this._destroyProj(proj);
      },
    );
  }

  _onProjHitFox(projGO, foxGO) {
    if (!projGO.active) return;
    const proj = this._projectiles.find(p => p.go === projGO);
    if (!proj) return;

    const em  = this.scene.enemyManager;
    const fox = em.foxes.find(f => f.gameObject === foxGO);
    if (!fox || !fox.alive) return;

    const dead = fox.takeDamage(proj.damage);
    if (dead) em.dropCores(fox.x, fox.y, 3);

    this._destroyProj(proj);
  }

  _destroyProj(proj) {
    const idx = this._projectiles.indexOf(proj);
    if (idx === -1) return;
    this._projectiles.splice(idx, 1);
    if (!proj.go.active) return;
    this._spawnRing(proj.go.x, proj.go.y, proj.color, proj.size * 3);
    this._projGroup.remove(proj.go, true, true);
  }

  _tickProjectiles() {
    this._projectiles = this._projectiles.filter(proj => {
      if (!proj.go.active) return false;
      const { x, y } = proj.go;
      if (x < -10 || x > ROOM_W + 10 || y < -10 || y > ROOM_H + 10) {
        this._projGroup.remove(proj.go, true, true);
        return false;
      }
      return true;
    });
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
