/**
 * 오소리 (Badger) — 잠행 돌격 탱커 (구역 3, 동물)
 * HP 220 / 속도 115 / 데미지 28(할퀴기) / 코어 9
 *
 * 패턴:
 *   chase  → 플레이어 추격. 80px 이내 진입 시 할퀴기 방향 고정 → windup
 *   windup → 0.4초 예고(정지)
 *   claw   → 정면 부채꼴(반경 100px, 전방 반원) 1회 판정. 등 뒤는 안전
 *   burrow → 5.5초마다 1.2초 땅속 이동(무적·untargetable, 플레이어 근처로 접근) → emerge
 *   emerge → 0.3초 출현 예고 → 기습 claw
 *   stun   → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * burrow 중에는 피격 무효(takeDamage false) + 접촉 데미지 없음(attackCooldown 강제 유지).
 * speedMult: 공용 속도 배수 경유 (추격·잠행 이동에 적용)
 */
const DETECT_R    = 330;
const CHASE_SPEED = 115;
const CLAW_RANGE  = 80;
const CLAW_R      = 100;   // 할퀴기 판정 반경
const WINDUP_DUR  = 0.4;
const CLAW_DUR    = 0.3;
const EMERGE_DUR  = 0.3;
const BURROW_CD   = 5.5;
const BURROW_DUR  = 1.2;
const BURROW_SPEED = 200;
const BG_W        = 32;
const BG_H        = 26;
const BG_DW       = 60;
const BG_DH       = 60;

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

// 상태: chase | windup | claw | burrow | emerge | stun
export default class Badger {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 220;
    this.maxHp  = 220;
    this.speed  = CHASE_SPEED;
    this.damage = 28;
    this.displayName = '오소리';

    this.state      = 'chase';
    this._prevState = 'chase';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 9;
    this.speedMult = 1.0;

    this._stateTimer = 0;
    this._burrowCd   = BURROW_CD * (0.5 + Math.random() * 0.5);
    this._faceX = 0;
    this._faceY = 1;
    this._clawDone = false;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'badger-s';

    this.gameObject = scene.add.image(x, y, 'badger-s').setDisplaySize(BG_DW, BG_DH);
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
      case 'chase': {
        if (dist >= DETECT_R) { this.gameObject.body.setVelocity(0, 0); break; }
        this._burrowCd -= dt;
        if (this._burrowCd <= 0 && dist > CLAW_RANGE) {
          this.state = 'burrow';
          this._stateTimer = BURROW_DUR;
          this.gameObject.setAlpha(0.35);
          break;
        }
        if (dist <= CLAW_RANGE) {
          this._enterWindup(dx, dy, dist);
          break;
        }
        this._moveTo(dx, dy, dist, CHASE_SPEED * this.speedMult);
        break;
      }

      case 'windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'claw';
          this._stateTimer = CLAW_DUR;
          this._clawDone = false;
        }
        break;

      case 'claw':
        this.gameObject.body.setVelocity(0, 0);
        if (!this._clawDone) {
          this._clawDone = true;
          this._doClaw(player, dx, dy, dist);
        }
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) this.state = dist < DETECT_R ? 'chase' : 'chase';
        break;

      case 'burrow':
        // 무적·접촉 무해 — 매 프레임 attackCooldown 유지로 접촉 데미지 차단
        this.attackCooldown = 1;
        this._moveTo(dx, dy, dist, BURROW_SPEED * this.speedMult);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.gameObject.setAlpha(1);
          this.attackCooldown = 0;
          this.state = 'emerge';
          this._stateTimer = EMERGE_DUR;
          this._faceX = dist > 0 ? dx / dist : 0;
          this._faceY = dist > 0 ? dy / dist : 1;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'emerge':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'claw';
          this._stateTimer = CLAW_DUR;
          this._clawDone = false;
          this._burrowCd = BURROW_CD;
        }
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
    // 잠행(burrow) 중 무적
    if (!this.alive || this.state === 'stun' || this.state === 'burrow') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (knockback) {
      const { dx, dy, force, duration } = knockback;
      this._knockbackTimer    = duration;
      this._knockbackDuration = duration;
      this._knockbackVx = dx * force;
      this._knockbackVy = dy * force;
    }
    this._prevState = (this.state === 'windup' || this.state === 'emerge' || this.state === 'claw') ? 'chase' : this.state;
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

  _enterWindup(dx, dy, dist) {
    this._faceX = dist > 0 ? dx / dist : 0;
    this._faceY = dist > 0 ? dy / dist : 1;
    this.state = 'windup';
    this._stateTimer = WINDUP_DUR;
    this.gameObject.body.setVelocity(0, 0);
  }

  /** 정면 부채꼴 할퀴기 — 반경 CLAW_R 내 + 전방 반원(dot > 0)일 때만 명중 */
  _doClaw(player, dx, dy, dist) {
    if (dist > CLAW_R) return;
    const len = dist > 0 ? dist : 1;
    const dot = (dx / len) * this._faceX + (dy / len) * this._faceY;
    if (dot <= 0) return; // 등 뒤 안전
    player.lastDamageSource = '오소리' + (this.isElite ? ' (정예)' : '');
    const dead = player.takeDamage(this.damage, {
      dx: dx / len, dy: dy / len, force: 240, duration: 0.18,
    });
    if (dead) this.scene.events.emit('player-dead');
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
    const key = `badger-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(BG_DW, BG_DH);
      this._applyBodySize();
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(BG_W / sx, BG_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 35, BG_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - BG_DW / 2, y - 35, BG_DW, 4, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 24);
    this._hpFill.setPosition(x - BG_DW / 2, y - 24);
    this._hpFill.width = BG_DW * Math.max(0, this.hp / this.maxHp);
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
