/**
 * 검은곰 (BlackBear) — 8층 중간 보스 (구역 2)
 * HP 448 / 속도 176 / 데미지 24(접촉) / 코어 30
 * 크기 70×70px
 *
 * 패턴 (우선순위: roar > 근거리 slam > 원거리 charge):
 *   idle   → chase (256px 이내 탐지)
 *   chase  → 플레이어 추격 (176px/s, 격노 시 202px/s)
 *            slam 쿨다운 5초(격노 3.5초) — 210px 이내일 때만 발동 (허공 슬램 방지)
 *            charge 쿨다운 6초(격노 ×0.75, 첫 차지 3초) — 150px 초과 거리에서만 (갭클로저)
 *            초기 9초/이후 22초 주기로 roar
 *   slam   → 0.6초 예고 → 반경 180px 충격파 (데미지 18 + 강한 넉백 400px/s)
 *            격노 시: 돌조각 6발 방사 (150px/s, 데미지 10 — 중거리 카이팅 견제)
 *   charge → 0.5초 발 구르기 예고(조준 고정 — 옆으로 피하면 빗나감) → 380px/s 직진 최대 0.9초
 *            (벽 충돌 시 조기 종료) → 멈춘 자리 미니 슬램 (반경 110px, 데미지 14 + 넉백)
 *   roar   → 1.8초 포효: 완전 정지 + 경직 취약
 *            종료 시 곰(bear) 4마리 소환 (최대 2회)
 *   stun   → 피격 경직 0.3초 + 넉백 (i-frame)
 *
 * 격노 (HP 40% 이하, 1회): 이동 ×1.15, slam 쿨다운 5→3.5초, charge 쿨다운 ×0.75,
 *   slam 돌조각 추가, 적갈색 틴트 + 화면 플래시
 *
 * 데미지 오라 (생존 중 상시):
 *   220px 이내 아군 다른 적의 데미지 ×1.25
 *   사망 시 영향받은 적 데미지 복원
 */
import { ROOM_W, ROOM_H, WALL_T } from '../world/Room';

const BB_W          = 60;
const BB_H          = 60;
const BB_DW         = 88;
const BB_DH         = 88;
const DETECT_R      = 256;
const CHASE_SPEED   = 176;
const SLAM_CD       = 5.0;
const SLAM_CD_ENRAGE = 3.5;  // 격노 시 슬램 주기 단축
const SLAM_TRIGGER_R = 210;  // 슬램 발동 거리 — 이내일 때만 (허공 슬램 방지)
const SLAM_WINDUP   = 0.6;
const SLAM_RADIUS   = 180;
const SLAM_DMG      = 18;
const SLAM_PUSH     = 400;
const SLAM_PUSH_DUR = 0.3;
const ROAR_INIT_CD  = 9;
const ROAR_CD       = 22;
const ROAR_DUR      = 1.8;
const AURA_R        = 220;
const AURA_MULT     = 1.25;
const SUMMON_COUNT  = 4;
const SUMMON_TYPE   = 'bear';
const SUMMON_MAX    = 2;

const CHARGE_CD        = 6.0;   // 차지 돌진 쿨다운 (격노 시 ×0.75)
const CHARGE_TRIGGER_R = 150;   // 이상 떨어져 있을 때만 차지 (갭클로저)
const CHARGE_WINDUP    = 0.5;   // 차지 예고 — 시작 시 조준 고정, 옆으로 피하면 빗나감
const CHARGE_SPEED     = 380;
const CHARGE_DUR_MAX   = 0.9;   // 최대 직진 시간 (벽 충돌 시 조기 종료)
const CHARGE_END_RADIUS = 110;  // 차지 종료 미니 슬램 반경
const CHARGE_END_DMG   = 14;

const ENRAGE_HP_RATIO  = 0.4;   // 격노 진입 HP 비율
const ENRAGE_SPEED_MULT = 1.15;
const ENRAGE_TINT      = 0xcc5544;
const SHARD_COUNT      = 6;     // 격노 슬램 시 비산 돌조각 수
const SHARD_SPEED      = 150;
const SHARD_DMG        = 10;
const SHARD_COLOR      = 0x886644;

function calcDir(vx, vy) {
  if (Math.abs(vx) < 1 && Math.abs(vy) < 1) return null;
  const a = Math.atan2(vy, vx) * 180 / Math.PI;
  if (a >  -22.5 && a <=   22.5) return 'e';
  if (a >   22.5 && a <=   67.5) return 'se';
  if (a >   67.5 && a <=  112.5) return 's';
  if (a >  112.5 && a <=  157.5) return 'sw';
  if (a >  157.5 || a <= -157.5) return 'w';
  if (a > -157.5 && a <= -112.5) return 'nw';
  if (a > -112.5 && a <=  -67.5) return 'n';
  return 'ne';
}

// 상태: idle | chase | slam_windup | charge_windup | charge | roar | stun
export default class BlackBear {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp        = 448;
    this.maxHp     = 448;
    this.speed     = CHASE_SPEED;
    this.damage    = 24;
    this.speedMult = 1.0;
    this.displayName = '검은곰';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 30;
    this.isBoss    = true;  // UIScene 보스 HP바 표시 + 처치 시 레어 아이템 드롭

    this._slamCd        = SLAM_CD;
    this._slamTimer     = 0;
    this._slamGfx       = null;
    this._slamHit       = false;
    this._roarTimer     = ROAR_INIT_CD;
    this._roarDur       = 0;
    this._roarUseCount  = 0;
    this._auraTargets   = new Map();  // Map<enemy, originalDamage>
    this._roarGfx       = null;

    this._chargeCd    = 3.0; // 첫 차지는 빠르게 — 개전 직후 갭클로저
    this._chargeDir   = { x: 0, y: 1 };
    this._chargeTimer = 0;
    this._enraged     = false; // HP 40% 이하 1회 진입 — 가속·슬램 단축·돌조각

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'blackbear-s';

    this.gameObject = scene.add.image(x, y, 'blackbear-s').setDisplaySize(BB_DW, BB_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.body.setMaxVelocity(350, 350);
    this.gameObject.setDepth(9);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (!this._enraged && this.hp / this.maxHp <= ENRAGE_HP_RATIO) this._enterEnrage();

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'chase';
        break;

      case 'chase': {
        if (dist >= DETECT_R) { this.state = 'idle'; this.gameObject.body.setVelocity(0, 0); break; }
        const len = dist > 0 ? dist : 1;
        this.gameObject.body.setVelocity(
          (dx / len) * this.speed * this.speedMult,
          (dy / len) * this.speed * this.speedMult,
        );
        this._slamCd -= dt;
        this._chargeCd -= dt;
        this._roarTimer -= dt;
        // 우선순위: 포효 > 근거리 슬램 > 원거리 차지 (쿨다운은 대기 중에도 준비 상태 유지)
        if (this._roarTimer <= 0) {
          this._startRoar();
        } else if (this._slamCd <= 0 && dist <= SLAM_TRIGGER_R) {
          this._startSlam();
        } else if (this._chargeCd <= 0 && dist > CHARGE_TRIGGER_R) {
          this._startChargeWindup(dx, dy, dist);
        }
        break;
      }

      case 'slam_windup':
        this.gameObject.body.setVelocity(0, 0);
        this._slamTimer -= dt;
        this._updateSlamGfx(1 - this._slamTimer / SLAM_WINDUP);
        if (this._slamTimer <= 0) this._triggerSlam(player);
        break;

      case 'charge_windup': // 발 구르기 예고 — 조준은 이미 고정
        this.gameObject.body.setVelocity(0, 0);
        this._chargeTimer -= dt;
        if (this._chargeTimer <= 0) {
          this.state = 'charge';
          this._chargeTimer = CHARGE_DUR_MAX;
        }
        break;

      case 'charge':
        this._chargeTimer -= dt;
        this.gameObject.body.setVelocity(this._chargeDir.x * CHARGE_SPEED, this._chargeDir.y * CHARGE_SPEED);
        if (this._chargeTimer <= CHARGE_DUR_MAX - 0.08 && !this.gameObject.body.blocked.none) {
          this._endCharge(player); break; // 벽 충돌 — 그 자리에서 미니 슬램
        }
        if (this._chargeTimer <= 0) this._endCharge(player);
        break;

      case 'roar':
        this._roarDur -= dt;
        this.gameObject.body.setVelocity(0, 0);
        if (this._roarDur <= 0) this._finishRoar();
        break;

      case 'stun':
        this.stunTimer -= dt;
        if (this._knockbackTimer > 0) {
          this._knockbackTimer -= dt;
          const t = Math.max(0, this._knockbackTimer) / this._knockbackDuration;
          this.gameObject.body.setVelocity(this._knockbackVx * t, this._knockbackVy * t);
        } else {
          this.gameObject.body.setVelocity(0, 0);
        }
        if (this.stunTimer <= 0) {
          this.gameObject.clearTint();
          this.state = this._prevState;
        }
        break;
    }

    this._updateAura();
    this._updateSprite();
    this._syncHpBar();
  }

  takeDamage(amount, knockback = null, opts = {}) {
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    const isAttacking = this.state === 'slam_windup' || this.state === 'roar'
                     || this.state === 'charge_windup' || this.state === 'charge';
    if (!isAttacking && !opts.noStagger) {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        // 무거운 보스: 넉백 40% 감산
        this._knockbackTimer    = duration * 0.4;
        this._knockbackDuration = duration * 0.4;
        this._knockbackVx = dx * force * 0.4;
        this._knockbackVy = dy * force * 0.4;
      }
      this._prevState = this.state;
      this.state      = 'stun';
      this.stunTimer  = 0.3;
    }
    this._blinkHit();
    return false;
  }

  poisonHp(amount) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) { this._die(); return true; }
    return false;
  }

  dispose() {
    if (this.destroyed) return;
    if (this._blinkEvent)    { this._blinkEvent.remove(); this._blinkEvent = null; }
    if (this._slamGfx?.active) this._slamGfx.destroy();
    if (this._roarGfx?.active) this._roarGfx.destroy();
    if (this._hpBg?.active)  this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this._restoreAura();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _startChargeWindup(dx, dy, dist) {
    const len = dist > 0 ? dist : 1;
    this._chargeDir = { x: dx / len, y: dy / len }; // 예고 시작 시 조준 고정
    this.state = 'charge_windup';
    this._chargeTimer = CHARGE_WINDUP;
    this.gameObject.body.setVelocity(0, 0);
    const cd = calcDir(this._chargeDir.x, this._chargeDir.y);
    if (cd) this._lastDir = cd;
  }

  /** 차지 종료 — 멈춘 자리에서 미니 슬램 (반경 110px, 데미지 14 + 넉백) */
  _endCharge(player) {
    this.gameObject.body.setVelocity(0, 0);
    this._chargeCd = CHARGE_CD * (this._enraged ? 0.75 : 1);
    this.state = 'chase';
    this.scene.cameras.main.shake(150, 0.014);

    const { x, y } = this.gameObject;
    const gfx = this.scene.add.graphics().setDepth(8);
    const state = { a: 0.6 };
    this.scene.tweens.add({
      targets: state, a: 0, duration: 300, ease: 'Quad.Out',
      onUpdate: () => {
        gfx.clear();
        gfx.fillStyle(0xff5522, state.a * 0.25);
        gfx.fillCircle(x, y, CHARGE_END_RADIUS);
        gfx.lineStyle(3, 0xff5522, state.a);
        gfx.strokeCircle(x, y, CHARGE_END_RADIUS);
      },
      onComplete: () => gfx.destroy(),
    });

    const dx = player.x - x, dy = player.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= CHARGE_END_RADIUS) {
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;
      const dead = player.takeDamage(CHARGE_END_DMG, {
        dx: nx, dy: ny, force: SLAM_PUSH * 0.7, duration: SLAM_PUSH_DUR,
      });
      if (dead) this.scene.events.emit('player-dead');
    }
  }

  _enterEnrage() {
    this._enraged = true;
    this.speed = Math.round(CHASE_SPEED * ENRAGE_SPEED_MULT);
    this.scene.cameras.main.flash(350, 200, 60, 30, false);
  }

  _startSlam() {
    this.state = 'slam_windup';
    this._slamTimer = SLAM_WINDUP;
    this._slamHit = false;
    this._slamGfx = this.scene.add.graphics().setDepth(8);
  }

  _updateSlamGfx(progress) {
    if (!this._slamGfx?.active) return;
    const r = SLAM_RADIUS * progress;
    const { x, y } = this.gameObject;
    this._slamGfx.clear();
    this._slamGfx.fillStyle(0xaa3300, 0.05 + progress * 0.12);
    this._slamGfx.fillCircle(x, y, r);
    this._slamGfx.lineStyle(3, 0xff5522, 0.4 + progress * 0.55);
    this._slamGfx.strokeCircle(x, y, r);
  }

  _triggerSlam(player) {
    if (this._slamGfx?.active) { this._slamGfx.destroy(); this._slamGfx = null; }
    this.scene.cameras.main.shake(220, 0.022);

    const { x, y } = this.gameObject;
    // 충격파 잔상
    const gfx = this.scene.add.graphics().setDepth(8);
    const state = { a: 0.7 };
    this.scene.tweens.add({
      targets: state, a: 0, duration: 380, ease: 'Quad.Out',
      onUpdate: () => {
        gfx.clear();
        gfx.fillStyle(0xff5522, state.a * 0.3);
        gfx.fillCircle(x, y, SLAM_RADIUS);
        gfx.lineStyle(4, 0xff5522, state.a);
        gfx.strokeCircle(x, y, SLAM_RADIUS);
      },
      onComplete: () => gfx.destroy(),
    });

    const dx = player.x - x, dy = player.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= SLAM_RADIUS) {
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;
      const dead = player.takeDamage(SLAM_DMG, {
        dx: nx, dy: ny, force: SLAM_PUSH, duration: SLAM_PUSH_DUR,
      });
      if (dead) this.scene.events.emit('player-dead');
    }

    // 격노: 슬램 충격으로 돌조각 비산 — AoE 밖 중거리 카이팅 견제
    if (this._enraged) this._emitShards(x, y);

    this._slamCd = this._enraged ? SLAM_CD_ENRAGE : SLAM_CD;
    this.state = 'chase';
  }

  /** 격노 슬램 돌조각 — poop_circle 흰 원 텍스처에 틴트 (Arc 금지 규칙 준수), 수동 이동 투사체 */
  _emitShards(x, y) {
    const em = this.scene.enemyManager;
    if (!em) return;
    const baseAng = Math.random() * Math.PI * 2;
    for (let i = 0; i < SHARD_COUNT; i++) {
      const ang = baseAng + (i / SHARD_COUNT) * Math.PI * 2;
      const proj = this.scene.add.image(x, y, 'poop_circle')
        .setTint(SHARD_COLOR)
        .setDisplaySize(12, 12)
        .setDepth(8);
      em.addEnemyProjectile(proj, SHARD_DMG, Math.cos(ang) * SHARD_SPEED, Math.sin(ang) * SHARD_SPEED, '검은곰 돌조각');
    }
  }

  _startRoar() {
    if (this._roarUseCount >= SUMMON_MAX) {
      this._roarTimer = ROAR_CD;
      return;
    }
    this.state = 'roar';
    this._roarDur = ROAR_DUR;
    this._playRoarEffect();
  }

  _finishRoar() {
    this._roarTimer = ROAR_CD;
    this._roarUseCount++;
    this.state = 'chase';
    this._summonMinions();
  }

  _summonMinions() {
    const em = this.scene.enemyManager;
    if (!em) return;
    const { x, y } = this.gameObject;
    const pad = WALL_T + 50;
    for (let i = 0; i < SUMMON_COUNT; i++) {
      const angle = (i / SUMMON_COUNT) * Math.PI * 2 + Math.random() * 0.6;
      const r     = 80 + Math.random() * 80;
      const sx    = Math.max(pad, Math.min(ROOM_W - pad, x + Math.cos(angle) * r));
      const sy    = Math.max(pad, Math.min(ROOM_H - pad, y + Math.sin(angle) * r));
      em.spawnEnemy(SUMMON_TYPE, sx, sy);
    }
  }

  _playRoarEffect() {
    if (this._roarGfx?.active) this._roarGfx.destroy();
    const gfx = this.scene.add.graphics().setDepth(10);
    gfx.setPosition(this.gameObject.x, this.gameObject.y);
    gfx.lineStyle(3, 0xff8866, 0.9);
    gfx.strokeCircle(0, 0, 16);
    this._roarGfx = gfx;
    this.scene.tweens.add({
      targets: gfx,
      scaleX: AURA_R / 16, scaleY: AURA_R / 16,
      alpha: 0,
      duration: 1100, ease: 'Quad.Out',
      onComplete: () => { if (gfx.active) gfx.destroy(); this._roarGfx = null; },
    });
  }

  _updateAura() {
    const enemies = this.scene.enemyManager?.enemies ?? [];
    const newTargets = new Map();
    for (const e of enemies) {
      if (e === this || !e.alive) continue;
      const ex = e.x - this.gameObject.x;
      const ey = e.y - this.gameObject.y;
      if (ex * ex + ey * ey <= AURA_R * AURA_R) {
        if (!this._auraTargets.has(e)) {
          newTargets.set(e, e.damage);
          e.damage = Math.round(e.damage * AURA_MULT);
        } else {
          newTargets.set(e, this._auraTargets.get(e));
        }
      }
    }
    // 범위를 벗어난 적 복원
    for (const [e, orig] of this._auraTargets) {
      if (!newTargets.has(e) && e.alive) e.damage = orig;
    }
    this._auraTargets = newTargets;
  }

  _restoreAura() {
    for (const [e, orig] of this._auraTargets) {
      if (e.alive) e.damage = orig;
    }
    this._auraTargets.clear();
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    let key;
    if (this.state === 'roar') {
      key = 'blackbear-roar';
    } else if (this.state === 'slam_windup' || this.state === 'charge_windup') {
      key = 'blackbear-slam'; // 웅크림 자세 공용
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `blackbear-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(BB_DW, BB_DH);
      this._applyBodySize();
    }
    if (this._enraged) this.gameObject.setTint(ENRAGE_TINT);
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(BB_W / sx, BB_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 50, BB_DW + 6, 5, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - (BB_DW + 6) / 2, y - 50, BB_DW + 6, 5, 0xdd5522)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 50);
    this._hpFill.setPosition(x - (BB_DW + 6) / 2, y - 50);
    this._hpFill.width = (BB_DW + 6) * Math.max(0, this.hp / this.maxHp);
    const vis = this.hp < this.maxHp;
    this._hpBg.setVisible(vis);
    this._hpFill.setVisible(vis);
  }

  _blinkHit() {
    if (this._blinkEvent) this._blinkEvent.remove();
    let flip = 0;
    this.gameObject.setTintFill(0xffffff);
    this._blinkEvent = this.scene.time.addEvent({
      delay: 60, repeat: 3,
      callback: () => {
        if (this.destroyed) return;
        flip++;
        if (flip % 2 === 0) this.gameObject.setTintFill(0xffffff);
        else this.gameObject.clearTint();
      },
    });
  }

  _die() {
    this.alive = false;
    this._restoreAura();
    this.gameObject.body.setEnable(false);
    if (this._blinkEvent)    { this._blinkEvent.remove(); this._blinkEvent = null; }
    if (this._slamGfx?.active) this._slamGfx.destroy();
    if (this._roarGfx?.active) this._roarGfx.destroy();
    this._hpBg.destroy();
    this._hpFill.destroy();

    this.scene.cameras.main.shake(300, 0.02);

    const sx = this.gameObject.scaleX * 2.4;
    const sy = this.gameObject.scaleY * 2.4;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 400, ease: 'Quad.Out',
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
