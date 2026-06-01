/**
 * 고슴도치 (Hedgehog) — 방어형
 * HP 112 / 속도 61 / 데미지 16(접촉) / 코어 드롭 4
 *
 * 패턴:
 *   idle  → chase(230px 이내 탐지)
 *   chase → 61px/s로 플레이어 추격
 *   spike → 2초마다 발동, 1초간 가시 원형 AoE(반경 65px, 데미지 12 + 넉백)
 *           spike 중 무적 — 공격받으면 플레이어만 넉백(데미지 없음)
 *   stun  → 피격 시 0.3초 경직 + 넉백 (spike 중 발동 불가, 이 시간 동안 추가 피격 무시 = i-frame)
 *
 * 시각: spike 중 hedgehog-spike 스프라이트 + AoE 원 페이드아웃
 * speedMult: Wolf 오라(180px 이내) 적용 시 추격 속도 ×1.2
 */
const DETECT_R       = 230;
const CHASE_SPEED    = 61;
const HEDGEHOG_W     = 24;   // 물리 body 크기 (canvas 26:24 비율 반영)
const HEDGEHOG_H     = 22;
const HEDGEHOG_DW    = 44;   // 표시 크기 (canvas 26:24 ≈ 1.08, 약간 넓게)
const HEDGEHOG_DH    = 40;
const SPIKE_CD       = 2.0;
const SPIKE_DUR      = 1.0;
const SPIKE_RADIUS   = 65;
const SPIKE_DMG      = 12;
const SPIKE_PUSH     = 300;
const SPIKE_PUSH_DUR = 0.25;
const THORN_FORCE    = 250;
const THORN_DUR      = 0.2;
const SPIKE_COLOR    = 0xddff44;

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

// 상태: idle | chase | spike | stun
export default class Hedgehog {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 112;
    this.maxHp  = 112;
    this.speed  = CHASE_SPEED;
    this.damage = 16;
    this.displayName = '고슴도치';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 4;
    this.speedMult = 1.0;

    this._spikeCd    = SPIKE_CD;
    this._spikeTimer = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'hedgehog-idle';

    this.gameObject = scene.add.image(x, y, 'hedgehog-idle').setDisplaySize(HEDGEHOG_DW, HEDGEHOG_DH);
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

      case 'chase':
        if (dist >= DETECT_R) { this.state = 'idle'; break; }
        this._spikeCd -= dt;
        if (this._spikeCd <= 0) { this._startSpike(); break; }
        this._moveTo(dx, dy, dist, CHASE_SPEED * this.speedMult);
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
          this.gameObject.clearTint();
          this.state = this._prevState;
        }
        break;
    }

    this._updateSprite();
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
    this._spawnSpikeGfx();
  }

  _stopSpike() {
    this.state = 'chase';
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

  _updateSprite() {
    if (this.state === 'stun') return;
    let key;
    if (this.state === 'spike') {
      key = 'hedgehog-spike';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = this.state === 'idle' ? 'hedgehog-idle' : `hedgehog-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(HEDGEHOG_DW, HEDGEHOG_DH);
      this._applyBodySize();
    }
  }

  // body.setSize 는 source 픽셀이라 setDisplaySize 로 확대된 작은 텍스처 위에선 body 가 부풀려진다.
  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(HEDGEHOG_W / sx, HEDGEHOG_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 25, HEDGEHOG_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - HEDGEHOG_DW / 2, y - 25, HEDGEHOG_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 25);
    this._hpFill.setPosition(x - HEDGEHOG_DW / 2, y - 25);
    this._hpFill.width = HEDGEHOG_DW * Math.max(0, this.hp / this.maxHp);
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
    this.gameObject.body.setEnable(false);
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    this._hpBg.destroy();
    this._hpFill.destroy();
    const sx = this.gameObject.scaleX * 1.8;
    const sy = this.gameObject.scaleY * 1.8;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 260, ease: 'Quad.Out',
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
