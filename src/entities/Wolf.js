/**
 * 늑대 (Wolf) — 엘리트형 중간 보스
 * HP 240 / 속도 176 / 데미지 12(접촉) / 코어 드롭 12
 * 크기 32×36px
 *
 * 패턴:
 *   idle  → chase (320px 이내 탐지)
 *   chase → 플레이어 추격 (176px/s)
 *           8초 뒤 첫 포효, 이후 20초마다 반복
 *   howl  → 1.5초 포효: 완전 정지 + 경직 취약
 *           종료 시 족제비(weasel) 2마리 소환
 *   stun  → 피격 경직 0.3초 + 넉백 (이 시간 동안 추가 피격 무시 = i-frame)
 *
 * 오라 (생존 중 상시):
 *   180px 이내 아군 speedMult ×1.2
 *   사망 시 영향받은 적 speedMult 복원
 */
import { ROOM_W, ROOM_H, WALL_T } from '../world/Room';

const WOLF_W        = 32;   // 물리 body 크기 (canvas 32×32 정사각형 반영)
const WOLF_H        = 32;
const WOLF_DW       = 56;   // 표시 크기 (canvas 32:32 정사각형 유지)
const WOLF_DH       = 56;
const DETECT_R      = 320;
const CHASE_SPEED   = 176;
const HOWL_INIT_CD  = 8;
const HOWL_CD       = 20;
const HOWL_DUR      = 1.5;
const AURA_R        = 180;
const AURA_MULT     = 1.2;
const SUMMON_COUNT  = 2;
const SUMMON_TYPE   = 'weasel'; // howl 소환 적 타입 — 항상 족제비

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

// 상태: idle | chase | howl | stun
export default class Wolf {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp        = 240;
    this.maxHp     = 240;
    this.speed     = CHASE_SPEED;
    this.damage    = 12;
    this.speedMult = 1.0;
    this.displayName = '늑대';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 12;

    this._howlTimer   = HOWL_INIT_CD;
    this._howlDur     = 0;
    this._auraTargets = new Set();
    this._howlGfx     = null;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'wolf-s';

    this.gameObject = scene.add.image(x, y, 'wolf-s').setDisplaySize(WOLF_DW, WOLF_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.setDepth(9);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

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
        this._howlTimer -= dt;
        if (this._howlTimer <= 0) this._startHowl();
        break;
      }

      case 'howl':
        this._howlDur -= dt;
        this.gameObject.body.setVelocity(0, 0);
        if (this._howlDur <= 0) this._finishHowl();
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

  takeDamage(amount, knockback = null) {
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (knockback) {
      const { dx, dy, force, duration } = knockback;
      this._knockbackTimer    = duration;
      this._knockbackDuration = duration;
      this._knockbackVx = dx * force;
      this._knockbackVy = dy * force;
    }
    this._prevState = this.state;
    this.state      = 'stun';
    this.stunTimer  = 0.3;
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
    if (this._howlGfx?.active) this._howlGfx.destroy();
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

  _startHowl() {
    this.state    = 'howl';
    this._howlDur = HOWL_DUR;
    this._playHowlEffect();
  }

  _finishHowl() {
    this._howlTimer = HOWL_CD;
    this.state = 'chase';
    this._summonMinions();
  }

  _summonMinions() {
    const em  = this.scene.enemyManager;
    const { x, y } = this.gameObject;
    const pad = WALL_T + 40;
    for (let i = 0; i < SUMMON_COUNT; i++) {
      const angle = (i / SUMMON_COUNT) * Math.PI * 2 + Math.random() * 0.8;
      const r     = 70 + Math.random() * 80;
      const sx    = Math.max(pad, Math.min(ROOM_W - pad, x + Math.cos(angle) * r));
      const sy    = Math.max(pad, Math.min(ROOM_H - pad, y + Math.sin(angle) * r));
      em.spawnEnemy(SUMMON_TYPE, sx, sy);
    }
  }

  _updateAura() {
    const enemies    = this.scene.enemyManager?.enemies ?? [];
    const newTargets = new Set();
    for (const e of enemies) {
      if (e === this || !e.alive) continue;
      const ex = e.x - this.gameObject.x;
      const ey = e.y - this.gameObject.y;
      if (ex * ex + ey * ey <= AURA_R * AURA_R) {
        e.speedMult = AURA_MULT;
        newTargets.add(e);
      }
    }
    for (const e of this._auraTargets) {
      if (!newTargets.has(e) && e.alive) e.speedMult = 1.0;
    }
    this._auraTargets = newTargets;
  }

  _restoreAura() {
    for (const e of this._auraTargets) {
      if (e.alive) e.speedMult = 1.0;
    }
    this._auraTargets.clear();
  }

  _playHowlEffect() {
    if (this._howlGfx?.active) this._howlGfx.destroy();
    const gfx = this.scene.add.graphics().setDepth(10);
    gfx.setPosition(this.gameObject.x, this.gameObject.y);
    gfx.lineStyle(3, 0xaabbaa, 0.9);
    gfx.strokeCircle(0, 0, 12);
    this._howlGfx = gfx;
    this.scene.tweens.add({
      targets: gfx,
      scaleX: AURA_R / 12, scaleY: AURA_R / 12,
      alpha: 0,
      duration: 900, ease: 'Quad.Out',
      onComplete: () => { if (gfx.active) gfx.destroy(); this._howlGfx = null; },
    });
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    let key;
    if (this.state === 'howl') {
      key = 'wolf-howl';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `wolf-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(WOLF_DW, WOLF_DH);
      this._applyBodySize();
    }
  }

  // body.setSize 는 source 픽셀이라 setDisplaySize 로 확대된 작은 텍스처 위에선 body 가 부풀려진다.
  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(WOLF_W / sx, WOLF_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 33, WOLF_DW + 4, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - (WOLF_DW + 4) / 2, y - 33, WOLF_DW + 4, 4, 0xdd6633)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 33);
    this._hpFill.setPosition(x - (WOLF_DW + 4) / 2, y - 33);
    this._hpFill.width = (WOLF_DW + 4) * Math.max(0, this.hp / this.maxHp);
    const vis = this.hp < this.maxHp;
    this._hpBg.setVisible(vis);
    this._hpFill.setVisible(vis);
  }

  _blinkHit() {
    if (this._blinkEvent) this._blinkEvent.remove();
    let flip = 0;
    this.gameObject.setTintFill(0xffffff);
    this._blinkEvent = this.scene.time.addEvent({
      delay: 80, repeat: 4,
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
    if (this._howlGfx?.active) this._howlGfx.destroy();
    this._hpBg.destroy();
    this._hpFill.destroy();
    const sx = this.gameObject.scaleX * 2.0;
    const sy = this.gameObject.scaleY * 2.0;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 300, ease: 'Quad.Out',
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
