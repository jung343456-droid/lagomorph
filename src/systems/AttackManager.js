import Phaser from 'phaser';
import { showDamageNumber } from '../utils/DamageNumbers';
import { getSlotPos, getSlotRadius } from '../data/Settings';

const MAX_CHARGE = 0.8; // 최대 충전 시간 (초): 이 시간 이상 누르면 MAX 티어
const BASE_R     = 60;  // 근거리 기본 공격 반경 (px, 티어 I 기준)

// 데미지는 player.baseAttack(기본 10) 에서 파생 — 근거리는 충전 단계별 dmgMult, 설치형은 ×TRAP_DMG_MULT.
const MELEE_TIERS = [
  { threshold: 0,   color: 0x4ecca3, label: '근거리 I',   dmgMult: 1.0, radius: BASE_R       },
  { threshold: 0.3, color: 0x88eecc, label: '근거리 II',  dmgMult: 1.2, radius: BASE_R * 1.2 },
  { threshold: 0.8, color: 0xffffff, label: '근거리 MAX', dmgMult: 1.4, radius: BASE_R * 1.5 },
];

const POOP_COST     = 3;    // 설치형 공격 1회당 소모 코어 수
const POOP_COOLDOWN = 0.3;  // 설치형 공격 재사용 대기 시간 (초)
const POOP_DMG      = 30;   // 설치형 공격 명중 데미지 (구버전 세이브 복원 폴백 전용 — 현재는 baseAttack×TRAP_DMG_MULT)
const TRAP_DMG_MULT = 3;    // 설치형 공격 데미지 = 기본 공격력 × 이 값
const POOP_SIZE     = 22;   // 설치형 오브젝트 크기 (px)
const MAX_POOPS     = 5;    // 동시에 배치 가능한 최대 설치물 수
const POOP_COLOR    = 0x7B3F20; // 설치물 색상 (갈색)

const FOX_KNOCKBACK_PER_DMG = 12;   // 설치형 공격 넉백 강도 = 데미지 × 이 값
const FOX_KNOCKBACK_DUR     = 0.22; // 설치형 공격 넉백 지속 시간 (초)

const SPLASH_RADIUS = 40;  // 위장 트랩 스플래시 반경 (px)
const SPLASH_DMG    = 15;  // 위장 트랩 스플래시 데미지
const DISGUISE_PROC = 0.5; // 위장 트랩 상태이상 발동 확률 (명중 enemy 1마리당, 위장 종류별 독립)

// 슬롯 탭 판정: 위치는 Settings.getSlotPos, 반지름은 getSlotRadius 가 제공
// (개별 자유 배치·크기 조절 가능). 시각이 원형이라 판정도 원형 거리로 맞춘다.

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
      scene.enemyManager.enemyGroup,
      this._onPoopHitEnemy,
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

    // scene.pause()(상점 오픈) 중에는 pointerup/keyup 이 도달하지 않아 _mCharging/_mKeydown 이
    // 켜진 채 남고, 닫은 뒤에도 A 버튼이 눌려있는 듯한 상태가 지속된다. pause·resume 시 강제 취소.
    this._pauseReset = () => this.cancelCharge();
    scene.events.on('pause',  this._pauseReset);
    scene.events.on('resume', this._pauseReset);
  }

  /** 모든 입력을 차단한다 (사망 후 호출). */
  disable() {
    this._disabled = true;
    this.cancelCharge();
  }

  /** 충전 상태 전체 리셋 — pause/resume 또는 외부에서 입력 흐름이 끊긴 경우 호출. */
  cancelCharge() {
    this._mCharging   = false;
    this._mChargeTime = 0;
    this._mPointerId  = null;
    this._mKeydown    = false;
    this.isCharging       = false;
    this.chargeNormalized = 0;
    this.currentTier      = 0;
    this.tierColor        = MELEE_TIERS[0].color;
    this.tierLabel        = '';
    if (this._previewGfx?.active) this._previewGfx.clear();
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
      const et = this._mChargeTime * this.player.chargeSpeedMult;
      this.chargeNormalized = Math.min(et / MAX_CHARGE, 1);
      this.currentTier      = this._calcTier(et, MELEE_TIERS);
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
    if (this._pauseReset) {
      this.scene.events.off('pause',  this._pauseReset);
      this.scene.events.off('resume', this._pauseReset);
      this._pauseReset = null;
    }
  }

  // ── 임시 저장 ─────────────────────────────────────────

  /** B 쿨다운과 설치 트랩을 직렬화. (전이성 충전 상태는 저장하지 않음 — 복원 시 리셋) */
  serialize() {
    return {
      bCooldown: this._bCooldown,
      poops: this._poops
        .filter(p => p.go.active)
        .map(p => ({ x: p.go.x, y: p.go.y, damage: p.damage })),
    };
  }

  /** 저장본으로부터 트랩·쿨다운을 복원. roomManager.restore(room-entered) 이후에 호출해야 한다. */
  restoreFromSave(data) {
    if (!data) return;
    this._poops.forEach(p => { if (p.go.active) this._poopGroup.remove(p.go, true, true); });
    this._poops = [];
    for (const t of data.poops ?? []) this._restorePoop(t.x, t.y, t.damage);
    this._bCooldown          = data.bCooldown ?? 0;
    this.bCooldownNormalized = this._bCooldown > 0 ? this._bCooldown / POOP_COOLDOWN : 0;
  }

  /** 저장된 좌표에 트랩 1개 재생성 — _placePoop 의 물리 셋업과 동일(코어 소모·링 이펙트 제외). */
  _restorePoop(x, y, damage) {
    const size = POOP_SIZE * this.player.trapSizeMult;
    const go = this.scene.add.image(x, y, 'poop_circle').setTint(POOP_COLOR);
    go.setDisplaySize(size, size);
    go.setDepth(5);
    this.scene.physics.add.existing(go);
    go.body.setCircle(40);
    go.body.setImmovable(true);
    go.body.setAllowGravity(false);
    this._poops.push({ go, damage: damage ?? POOP_DMG, size });
    this._poopGroup.add(go);
  }

  // ── 포인터 바인딩 ────────────────────────────────────

  _bindPointers() {
    this._onDown = (p) => {
      if (this._disabled) return;
      if (this._inBSlot(p)) {
        this._startPlace();
        return;
      }
      if (!this._inASlot(p)) return;
      // 계단 근접 시 A 슬롯 탭은 다음 층 진입으로 가로채기 (공격 충전은 건너뜀)
      if (this.scene._tryEnterStairs?.()) return;
      if (this._mCharging) return;
      this._mPointerId  = p.id;
      this._mCharging   = true;
      this._mChargeTime = 0;
      this._updateAimDir(p, this._mAimDir);
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
      if (this._disabled) return;
      // 계단 근접 시 Z 키는 다음 층 진입으로 가로채기
      if (this.scene._tryEnterStairs?.()) return;
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

    this._xKey.on('down', () => { if (!this._disabled) this._startPlace(); });
  }

  _updateAimDir(pointer, dir) {
    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const dx = wp.x - this.player.x;
    const dy = wp.y - this.player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) { dir.x = dx / len; dir.y = dy / len; }
  }

  _inASlot(p) {
    const c = getSlotPos('A');
    const r = getSlotRadius('A');
    const dx = p.x - c.x, dy = p.y - c.y;
    return dx * dx + dy * dy <= r * r;
  }

  _inBSlot(p) {
    const c = getSlotPos('B');
    const r = getSlotRadius('B');
    const dx = p.x - c.x, dy = p.y - c.y;
    return dx * dx + dy * dy <= r * r;
  }

  // ── 근거리 공격 (A / Z) ──────────────────────────────

  _fireMelee() {
    const tier   = MELEE_TIERS[this._calcTier(this._mChargeTime * this.player.chargeSpeedMult, MELEE_TIERS)];
    const radius = tier.radius * this.player.meleeRadiusMult;
    const damage = Math.round(this.player.baseAttack * tier.dmgMult * this.player.meleeDamageMult);
    const { x: px, y: py } = this.player;

    this.scene.events.emit('attack-fired', {
      tierData: { shape: 'circle', radius, damage },
      playerX: px, playerY: py,
      aimDir:  { ...this._mAimDir },
    });

    this._spawnRing(px, py, tier.color, radius);
  }

  _stopMelee() {
    this._mCharging   = false;
    this._mChargeTime = 0;
    this._mPointerId  = null;
    this._previewGfx.clear();
  }

  _drawMeleePreview() {
    const tier   = MELEE_TIERS[this.currentTier];
    const radius = tier.radius * this.player.meleeRadiusMult;
    const { x: px, y: py } = this.player;
    const pulse = 0.22 + 0.08 * Math.sin(this._mChargeTime * 12);
    this._previewGfx.clear();
    this._previewGfx.fillStyle(tier.color, pulse);
    this._previewGfx.lineStyle(2, tier.color, pulse + 0.3);
    this._previewGfx.fillCircle(px, py, radius);
    this._previewGfx.strokeCircle(px, py, radius);
  }

  // ── 설치형 공격 (B / X) ─────────────────────────────

  _startPlace() {
    const em   = this.scene.enemyManager;
    const cost = Math.max(1, POOP_COST - this.player.trapCostBonus);
    const maxTraps = MAX_POOPS + (this.player.trapMaxBonus ?? 0);
    if (this._bCooldown > 0)            return;
    if (this._poops.length >= maxTraps)  return;
    if (em.coreCount < cost)            return;

    em.coreCount -= cost;
    this._placePoop();
    this._bCooldown          = POOP_COOLDOWN;
    this.bCooldownNormalized = 1;
  }

  _placePoop() {
    const { x: px, y: py } = this.player;
    const size = POOP_SIZE * this.player.trapSizeMult;
    // 원형 표시: 흰 원 텍스처(poop_circle 80px)에 tint·displaySize 적용 (Arc 금지 규칙 준수)
    const go = this.scene.add.image(px, py, 'poop_circle').setTint(POOP_COLOR);
    go.setDisplaySize(size, size);
    go.setDepth(5);
    this.scene.physics.add.existing(go);
    // 물리 body 도 원형 — 텍스처 80px 기준 반경 40 (displaySize 스케일에 맞춰 자동 축소)
    go.body.setCircle(40);
    go.body.setImmovable(true);
    go.body.setAllowGravity(false);
    this._poops.push({ go, damage: this.player.baseAttack * TRAP_DMG_MULT, size });
    this._poopGroup.add(go);
    this._spawnRing(px, py, POOP_COLOR, size * 2);
  }

  _onPoopHitEnemy(poopGO, enemyGO) {
    if (!poopGO.active) return;
    const poop = this._poops.find(p => p.go === poopGO);
    if (!poop) return;

    const em     = this.scene.enemyManager;
    const enemy  = em.enemies.find(e => e.gameObject === enemyGO);
    if (!enemy || !enemy.alive) return;

    // 고슴도치 가시 상태: 무적 — 데미지 숫자 표시 안 함 (takeDamage 가 내부에서 넉백 반사 처리)
    const isSpike = enemy.state === 'spike';

    const ddx = enemyGO.x - poopGO.x;
    const ddy = enemyGO.y - poopGO.y;
    const len = Math.sqrt(ddx * ddx + ddy * ddy);
    const nx  = len > 0 ? ddx / len : 1;
    const ny  = len > 0 ? ddy / len : 0;
    // 트랩 직격 데미지에 치명타 적용 — 넉백은 원본 기준
    const { damage: trapDmg, isCrit: trapCrit } = this.player.rollAttackDamage(poop.damage);
    const dead = enemy.takeDamage(trapDmg, {
      dx: nx, dy: ny,
      force:    poop.damage * FOX_KNOCKBACK_PER_DMG,
      duration: FOX_KNOCKBACK_DUR,
    }, 'poop');
    if (!isSpike) showDamageNumber(this.scene, enemy.x, enemy.y - enemyGO.height / 2, trapDmg, '#ffffff', trapCrit);
    // 피의 향연 — 트랩 직격 치명 시 회복
    if (trapCrit && !isSpike && this.player.critHealAmount > 0) {
      this.player.heal(this.player.critHealAmount);
    }
    if (dead) {
      em.dropCores(enemy.x, enemy.y, enemy.coreDrops ?? 3, enemy.isFinalBoss);
      if (enemy.isBoss) { em.dropRareItem(enemy.x, enemy.y); em.boss = null; }
      em.dropEliteItem(enemy);
      if (this.player.healOnKill > 0) this.player.heal(this.player.healOnKill);
    }

    // 위장 트랩: 직접 명중한 적에게 상태이상 시도 (spike·사망 제외)
    if (this._anyDisguise() && !isSpike && !dead) {
      this._applyDisguiseStatus(enemy, em);
    }

    const splashX = poopGO.x;
    const splashY = poopGO.y;
    this._destroyPoop(poop);

    // 위장 트랩 스플래시: 주변 적에게 폭발 데미지 + 상태이상 시도
    if (this._anyDisguise()) {
      this._spawnRing(splashX, splashY, this._disguiseRingColor(), SPLASH_RADIUS * 2);
      em.enemies.forEach(other => {
        if (!other.alive || other === enemy || other.state === 'stun') return;
        if (Phaser.Math.Distance.Between(splashX, splashY, other.x, other.y) > SPLASH_RADIUS) return;
        const odx = other.x - splashX, ody = other.y - splashY;
        const ol  = Math.sqrt(odx * odx + ody * ody) || 1;
        const { damage: splashDmg, isCrit: splashCrit } = this.player.rollAttackDamage(SPLASH_DMG);
        const splashDead = other.takeDamage(splashDmg, {
          dx: odx / ol, dy: ody / ol,
          force:    SPLASH_DMG * FOX_KNOCKBACK_PER_DMG,
          duration: FOX_KNOCKBACK_DUR,
        }, 'poop');
        showDamageNumber(this.scene, other.x, other.y - other.gameObject.height / 2, splashDmg, '#ffffff', splashCrit);
        if (splashCrit && other.state !== 'spike' && this.player.critHealAmount > 0) {
          this.player.heal(this.player.critHealAmount);
        }
        if (splashDead) {
          em.dropCores(other.x, other.y, other.coreDrops ?? 3, other.isFinalBoss);
          if (other.isBoss) { em.dropRareItem(other.x, other.y); em.boss = null; }
          em.dropEliteItem(other);
          if (this.player.healOnKill > 0) this.player.heal(this.player.healOnKill);
        } else if (other.state !== 'spike') {
          this._applyDisguiseStatus(other, em);
        }
      });
    }
  }

  _anyDisguise() {
    const p = this.player;
    return p.hasFireDisguise || p.hasIceDisguise || p.hasPoisonDisguise;
  }

  _applyDisguiseStatus(enemy, em) {
    const p = this.player;
    if (p.hasFireDisguise   && Math.random() < DISGUISE_PROC) em._applyBurn(enemy);
    if (p.hasIceDisguise    && Math.random() < DISGUISE_PROC) em._applyFreeze(enemy);
    if (p.hasPoisonDisguise && Math.random() < DISGUISE_PROC) em._applyPoison(enemy);
  }

  _disguiseRingColor() {
    const p = this.player;
    if (p.hasFireDisguise)   return 0xff6622;
    if (p.hasIceDisguise)    return 0x88ccff;
    if (p.hasPoisonDisguise) return 0xaa44ff;
    return 0xff6600;
  }

  _destroyPoop(poop) {
    const idx = this._poops.indexOf(poop);
    if (idx === -1) return;
    this._poops.splice(idx, 1);
    if (!poop.go.active) return;
    this._spawnRing(poop.go.x, poop.go.y, POOP_COLOR, (poop.size ?? POOP_SIZE) * 3);
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
