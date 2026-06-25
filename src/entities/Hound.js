/**
 * 사냥개 (Hound) — 구역 3 표시 5층 보스 "사냥개 무리" 구성원 (2마리 + 정예 활사냥꾼 2와 함께 스폰)
 *   ※ 표시 3층 중간보스(Hound×2)에서도 사용. 무리 분노는 살아있는 사냥개 수만 셈.
 * HP 130 / 속도 200 / 데미지 16(접촉/돌진) / 코어 8
 *
 * 패턴 (Weasel 대시 + 무리 분노 응용):
 *   chase    → 플레이어 추격
 *   windup   → 0.25초 예고(돌진 방향 고정)  ※220px 이내 + 돌진 쿨다운 0 일 때
 *   lunge    → 380px/s 도약 돌진 0.35초(접촉 데미지)
 *   cooldown → 0.6초 대기 → chase
 *   stun     → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 무리 분노: 살아있는 사냥개가 1마리만 남으면 속도 ×1.3 + 돌진 쿨다운 단축.
 * 보스 처치는 방 타입('boss')으로 처리 — 마지막 1마리 사망 시 boss-cleared (Wolf×2 와 동일).
 * speedMult: 공용 속도 배수 경유 (추격에 적용, 돌진 속도는 고정).
 */
const DETECT_R    = 460;
const CHASE_SPEED = 200;
const LUNGE_RANGE = 220;
const LUNGE_SPEED = 380;
const WINDUP_DUR  = 0.25;
const LUNGE_DUR   = 0.35;
const COOL_DUR    = 0.6;
const COOL_RAGE   = 0.3;
const RAGE_SPD    = 1.3;
const LUNGE_CD    = 2.5;
const HOUND_W     = 26;
const HOUND_H     = 22;
const HOUND_DW    = 42;
const HOUND_DH    = 34;

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

// 상태: chase | windup | lunge | cooldown | stun
export default class Hound {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 130;
    this.maxHp  = 130;
    this.speed  = CHASE_SPEED;
    this.damage = 16;
    this.displayName = '사냥개';

    this.state      = 'chase';
    this._prevState = 'chase';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 8;
    this.speedMult = 1.0;

    this._stateTimer = 0;
    this._lungeCd    = LUNGE_CD * (0.4 + Math.random() * 0.8); // 묶음 스폰 시 돌진 타이밍 분산
    this._lungeVx = 0;
    this._lungeVy = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'hound-s';

    this.gameObject = scene.add.image(x, y, 'hound-s').setDisplaySize(HOUND_DW, HOUND_DH);
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
    const rage = this._isLastHound();

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'chase': {
        this._lungeCd -= dt;
        if (dist <= LUNGE_RANGE && this._lungeCd <= 0) {
          const len = dist > 0 ? dist : 1;
          this._lungeVx = (dx / len) * LUNGE_SPEED;
          this._lungeVy = (dy / len) * LUNGE_SPEED;
          this.state = 'windup';
          this._stateTimer = WINDUP_DUR;
          this.gameObject.body.setVelocity(0, 0);
          break;
        }
        const spd = CHASE_SPEED * this.speedMult * (rage ? RAGE_SPD : 1);
        this._moveTo(dx, dy, dist, spd);
        break;
      }

      case 'windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) { this.state = 'lunge'; this._stateTimer = LUNGE_DUR; }
        break;

      case 'lunge':
        this.gameObject.body.setVelocity(this._lungeVx, this._lungeVy);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'cooldown';
          this._stateTimer = rage ? COOL_RAGE : COOL_DUR;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'cooldown':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) { this.state = 'chase'; this._lungeCd = rage ? LUNGE_CD * 0.5 : LUNGE_CD; }
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

    this._updateSprite();
    this._syncHpBar();
  }

  takeDamage(amount, knockback = null) {
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (this.state !== 'lunge') {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = (this.state === 'windup') ? 'chase' : this.state;
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

  _isLastHound() {
    const enemies = this.scene.enemyManager?.enemies ?? [];
    let n = 0;
    for (const e of enemies) if (e.alive && e.displayName === '사냥개') n++;
    return n <= 1;
  }

  _moveTo(dx, dy, dist, speed) {
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    this.gameObject.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 액션 상태도 전용 스프라이트 없이 이동 방향 스프라이트를 그대로 사용한다.
    const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    if (dir) this._lastDir = dir;
    const key = `hound-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(HOUND_DW, HOUND_DH);
      this._applyBodySize();
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(HOUND_W / sx, HOUND_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 24, HOUND_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - HOUND_DW / 2, y - 24, HOUND_DW, 4, 0xdd4444)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 24);
    this._hpFill.setPosition(x - HOUND_DW / 2, y - 24);
    this._hpFill.width = HOUND_DW * Math.max(0, this.hp / this.maxHp);
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
