/**
 * 고슴도치 (Hedgehog) — 방어형
 * HP 70 / 속도 55 / 데미지 16(접촉) / 코어 드롭 4
 *
 * 패턴:
 *   idle  → chase(180px 이내 탐지)
 *   chase → 55px/s로 플레이어 추격
 *   spike → 2초마다 발동, 1초간 가시 원형 AoE(반경 65px, 데미지 12 + 넉백)
 *           spike 중 무적 — 공격받으면 플레이어만 넉백(데미지 없음)
 *   stun  → 피격 시 0.4초 경직 + 넉백 (spike 중 발동 불가)
 *
 * 시각: spike 중 색상이 밝은 노랑-초록(0xddff44)으로 변하고 AoE 원이 페이드아웃
 */
const DETECT_R       = 180;           // 플레이어 탐지 반경 (px)
const CHASE_SPEED    = 55;            // 일반 추격 속도 (px/s)
const HEDGEHOG_W     = 26;            // 스프라이트 크기 (정사각형, px)
const SPIKE_CD       = 2.0;           // 가시 공격 주기 (초)
const SPIKE_DUR      = 1.0;           // 가시 공격 지속 시간 (초)
const SPIKE_RADIUS   = HEDGEHOG_W * 2.5; // 가시 AoE 반경 (px) — 캐릭터 크기 2.5배
const SPIKE_DMG      = 12;            // 가시 AoE 명중 데미지
const SPIKE_PUSH     = 300;           // 가시 AoE 넉백 강도
const SPIKE_PUSH_DUR = 0.25;          // 가시 AoE 넉백 지속 시간 (초)
const THORN_FORCE    = 250;           // 공격 반사 넉백 강도 (가시 공격 중 피격 시 플레이어에게 반사)
const THORN_DUR      = 0.2;           // 공격 반사 넉백 지속 시간 (초)
const HEDGEHOG_COLOR = 0x556633;      // 기본 색상 (올리브 녹색)
const SPIKE_COLOR    = 0xddff44;      // 가시 공격 중 색상 (밝은 노랑-초록)
const HIT_COLOR      = 0xffffff;      // 피격 깜빡임 색상 (흰색)

// 상태: idle | chase | spike | stun
export default class Hedgehog {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 70;
    this.maxHp  = 70;
    this.speed  = CHASE_SPEED;
    this.damage = 16;

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 4;

    this._spikeCd    = SPIKE_CD;
    this._spikeTimer = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this.gameObject = scene.add.rectangle(x, y, HEDGEHOG_W, HEDGEHOG_W, HEDGEHOG_COLOR);
    scene.physics.add.existing(this.gameObject);
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

      case 'chase':
        if (dist >= DETECT_R) { this.state = 'idle'; break; }
        this._spikeCd -= dt;
        if (this._spikeCd <= 0) { this._startSpike(); break; }
        this._moveTo(dx, dy, dist, CHASE_SPEED);
        break;

      case 'spike': {
        this.gameObject.body.setVelocity(0, 0);
        this._spikeTimer -= dt;
        const pdx = player.x - this.gameObject.x;
        const pdy = player.y - this.gameObject.y;
        const pd  = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pd <= SPIKE_RADIUS) {
          const nx   = pd > 0 ? pdx / pd : 0;
          const ny   = pd > 0 ? pdy / pd : 0;
          const dead = player.takeDamage(SPIKE_DMG, {
            dx: nx, dy: ny, force: SPIKE_PUSH, duration: SPIKE_PUSH_DUR,
          });
          if (dead) this.scene.events.emit('player-dead');
        }
        if (this._spikeTimer <= 0) this._stopSpike();
        break;
      }

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
          this.gameObject.setFillStyle(HEDGEHOG_COLOR);
          this.state = this._prevState;
        }
        break;
    }

    this._syncHpBar();
  }

  // source 파라미터는 하위 호환성 유지용 (spike 중 모든 공격 차단)
  takeDamage(amount, knockback = null, source = 'melee') {
    if (!this.alive || this.state === 'stun') return false;

    if (this.state === 'spike') {
      // 가시 공격 중 무적 — 플레이어에게 넉백만 반사 (데미지 없음)
      const player = this.scene.enemyManager.player;
      const rdx = this.gameObject.x - player.x;
      const rdy = this.gameObject.y - player.y;
      const rd  = Math.sqrt(rdx * rdx + rdy * rdy);
      player.takeDamage(0, {
        dx: rd > 0 ? -rdx / rd : 0,
        dy: rd > 0 ? -rdy / rd : 0,
        force:    THORN_FORCE,
        duration: THORN_DUR,
      });
      return false;
    }

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
    this.stunTimer  = 0.4;
    this._blinkColor();
    return false;
  }

  dispose() {
    if (this.destroyed) return;
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _startSpike() {
    this.state       = 'spike';
    this._spikeTimer = SPIKE_DUR;
    this._spikeCd    = SPIKE_CD;
    this.gameObject.setFillStyle(SPIKE_COLOR);
    this._spawnSpikeGfx();
  }

  _stopSpike() {
    this.state = 'chase';
    this.gameObject.setFillStyle(HEDGEHOG_COLOR);
  }

  _spawnSpikeGfx() {
    const gfx = this.scene.add.graphics().setDepth(8);
    const { x, y } = this.gameObject;
    const state = { a: 0.55 };
    this.scene.tweens.add({
      targets: state,
      a: 0,
      duration: SPIKE_DUR * 1000,
      ease: 'Linear',
      onUpdate: () => {
        gfx.clear();
        gfx.fillStyle(SPIKE_COLOR, state.a * 0.3);
        gfx.fillCircle(x, y, SPIKE_RADIUS);
        gfx.lineStyle(2, SPIKE_COLOR, state.a);
        gfx.strokeCircle(x, y, SPIKE_RADIUS);
      },
      onComplete: () => gfx.destroy(),
    });
  }

  _moveTo(dx, dy, dist, speed) {
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    this.gameObject.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 22, HEDGEHOG_W, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - HEDGEHOG_W / 2, y - 22, HEDGEHOG_W, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 22);
    this._hpFill.setPosition(x - HEDGEHOG_W / 2, y - 22);
    this._hpFill.width = HEDGEHOG_W * Math.max(0, this.hp / this.maxHp);
  }

  _blinkColor() {
    if (this._blinkEvent) this._blinkEvent.remove();
    let flip = 0;
    this.gameObject.setFillStyle(HIT_COLOR);
    this._blinkEvent = this.scene.time.addEvent({
      delay: 80, repeat: 4,
      callback: () => {
        if (this.destroyed) return;
        flip++;
        this.gameObject.setFillStyle(flip % 2 === 0 ? HIT_COLOR : HEDGEHOG_COLOR);
      },
    });
  }

  _die() {
    this.alive = false;
    this.gameObject.body.setEnable(false);
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    this._hpBg.destroy();
    this._hpFill.destroy();
    this.scene.tweens.add({
      targets:  this.gameObject,
      alpha:    0,
      scaleX:   1.8,
      scaleY:   1.8,
      duration: 260,
      ease:     'Quad.Out',
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
