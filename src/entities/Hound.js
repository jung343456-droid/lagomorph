/**
 * 사냥개 (Hound) — 구역 3 표시 5층 보스 "사냥개 무리" 구성원 (2마리 + 정예 활사냥꾼 2와 함께 스폰)
 *   ※ 표시 3층 중간보스(Hound×2)에서도 사용. 무리 분노는 살아있는 사냥개 수만 셈.
 * HP 580 / 속도 240 / 데미지 28(접촉/돌진) / 코어 14
 *
 * 패턴 (무리 포위 + 치고 빠지기):
 *   chase    → 측면 포위 접근(_stalk): 멀면 직진 접근, 가까우면 선회해 플레이어를 에워쌈
 *              (_flankSign 좌/우 분산 — 무리가 사방에서 압박)
 *   windup   → 0.25초 예고(돌진 방향 고정)  ※220px 이내 + 돌진 쿨다운 0 일 때, 흔히 측면에서 진입
 *   lunge    → 470px/s 도약 돌진 0.35초(접촉 데미지)
 *   cooldown → 0.3초 후퇴(치고 빠지기) 후 chase, 가끔 포위 방향 전환
 *   stun     → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 무리 분노: 살아있는 사냥개가 1마리만 남으면 속도 ×1.4 + 돌진 쿨다운 단축 + 선회를 줄이고 직선 돌격 위주.
 * 보스 처치는 방 타입('boss')으로 처리 — 마지막 1마리 사망 시 boss-cleared (Wolf×2 와 동일).
 * speedMult: 공용 속도 배수 경유 (추격·포위에 적용, 돌진 속도는 고정).
 */
const DETECT_R    = 460;
const CHASE_SPEED = 240;
const LUNGE_RANGE = 220;
const LUNGE_SPEED = 470;
const WINDUP_DUR  = 0.25;
const LUNGE_DUR   = 0.35;
const COOL_DUR    = 0.3;
const COOL_RAGE   = 0.18;
const BACKSTEP_SPEED = 190;   // cooldown 후퇴 속도 (치고 빠지기)
const RAGE_SPD    = 1.4;
const LUNGE_CD    = 1.6;
const HOUND_W     = 26;
const HOUND_H     = 22;
const HOUND_DW    = 60;
const HOUND_DH    = 60;

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

    this.hp     = 580;
    this.maxHp  = 580;
    this.speed  = CHASE_SPEED;
    this.damage = 28;
    this.displayName = '사냥개';

    this.state      = 'chase';
    this._prevState = 'chase';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 14;
    this.speedMult = 1.0;

    this._stateTimer = 0;
    this._lungeCd    = LUNGE_CD * (0.4 + Math.random() * 0.8); // 묶음 스폰 시 돌진 타이밍 분산
    this._lungeVx = 0;
    this._lungeVy = 0;
    this._flankSign = Math.random() < 0.5 ? 1 : -1;            // 좌/우 포위 방향 분산

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
        this._stalk(dx, dy, dist, spd, rage);
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

      case 'cooldown': {
        // 치고 빠지기 — 도약 후 그 자리에 멈추지 않고 플레이어에게서 짧게 후퇴
        const len = dist > 0 ? dist : 1;
        const bspd = BACKSTEP_SPEED * this.speedMult;
        this.gameObject.body.setVelocity((-dx / len) * bspd, (-dy / len) * bspd);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'chase';
          this._lungeCd = rage ? LUNGE_CD * 0.5 : LUNGE_CD;
          if (Math.random() < 0.4) this._flankSign *= -1;   // 가끔 포위 방향 전환 (흔들기)
        }
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

  takeDamage(amount, knockback = null, opts = {}) {
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (this.state !== 'lunge' && !opts.noStagger) {
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

  /**
   * 측면 포위 접근 — 직진(접근) 성분과 접선(선회) 성분을 거리에 따라 섞는다.
   * 멀면 직진 위주로 거리를 좁히고, 도약 사거리 부근에선 선회 위주로 플레이어를 에워싼다.
   * 분노 시엔 선회를 거의 버리고 직선 돌격.
   */
  _stalk(dx, dy, dist, speed, rage) {
    const len = dist > 0 ? dist : 1;
    const toX = dx / len, toY = dy / len;
    const perpX = -toY * this._flankSign;
    const perpY =  toX * this._flankSign;
    let tang;
    if (rage) {
      tang = 0.15;
    } else {
      const t = Math.max(0, Math.min(1, (dist - LUNGE_RANGE) / 220)); // 멀수록 1
      tang = 0.6 - 0.4 * t;   // 멀면 0.2(접근 위주), 가까우면 0.6(포위 위주)
    }
    let vx = toX * (1 - tang) + perpX * tang;
    let vy = toY * (1 - tang) + perpY * tang;
    const m = Math.hypot(vx, vy) || 1;
    this.gameObject.body.setVelocity((vx / m) * speed, (vy / m) * speed);
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
    this._hpBg   = this.scene.add.rectangle(x, y - 35, HOUND_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - HOUND_DW / 2, y - 35, HOUND_DW, 4, 0xdd4444)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 35);
    this._hpFill.setPosition(x - HOUND_DW / 2, y - 35);
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
