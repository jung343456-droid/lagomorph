/**
 * 까마귀 (Crow) — 공중 정찰·표식 지원형 (구역 3, 동물)
 * HP 18 / 속도 150 / 데미지 7(쪼기 접촉) / 코어 3
 *
 * 패턴:
 *   circle → 플레이어 주위 180px 선회
 *   mark   → 5초마다 0.5초 정지(울음) → 플레이어에 표식 3초 부여
 *            표식 동안 주변 260px 사냥꾼(단검/활)의 speedMult ×1.15 (Wolf 오라 패턴)
 *   dive   → 7초마다 0.4초 급강하 직선 돌진(접촉 데미지) 후 circle 복귀
 *   stun   → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 약점: mark 시전 0.5초 정지. 사망/표식 만료 시 버프 즉시 복원(_restoreAura).
 * 표식 버프는 displayName 에 '사냥꾼' 포함된 적에게만 적용.
 */
const DETECT_R    = 360;
const ORBIT_DIST  = 180;
const ORBIT_SPEED = 150;
const MARK_CD     = 5.0;
const MARK_WIND   = 0.5;
const MARK_DUR    = 3.0;
const MARK_R      = 260;
const MARK_MULT   = 1.15;
const DIVE_CD     = 7.0;
const DIVE_DUR    = 0.4;
const DIVE_SPEED  = 300;
const CROW_W      = 22;
const CROW_H      = 16;
const CROW_DW     = 32;
const CROW_DH     = 26;

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

// 상태: circle | mark | dive | stun
export default class Crow {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 18;
    this.maxHp  = 18;
    this.speed  = ORBIT_SPEED;
    this.damage = 7;
    this.displayName = '까마귀';

    this.state      = 'circle';
    this._prevState = 'circle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 3;
    this.speedMult = 1.0;

    this._markCd     = MARK_CD * (0.4 + Math.random() * 0.6);
    this._markWind   = 0;
    this._markTimer  = 0;   // > 0 동안 표식 버프 활성
    this._diveCd     = DIVE_CD * (0.5 + Math.random() * 0.5);
    this._diveTimer  = 0;
    this._diveVx = 0;
    this._diveVy = 0;
    this._orbitSign  = Math.random() < 0.5 ? 1 : -1;
    this._auraTargets = new Set();

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'crow-s';

    this.gameObject = scene.add.image(x, y, 'crow-s').setDisplaySize(CROW_DW, CROW_DH);
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
    if (this._markTimer > 0) { this._markTimer -= dt; this._updateAura(); }
    else if (this._auraTargets.size > 0) this._restoreAura();

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'circle': {
        if (dist >= DETECT_R) { this.gameObject.body.setVelocity(0, 0); break; }
        this._orbit(dx, dy, dist);
        this._markCd -= dt;
        if (this._markCd <= 0) {
          this.state = 'mark';
          this._markWind = MARK_WIND;
          this.gameObject.body.setVelocity(0, 0);
          break;
        }
        this._diveCd -= dt;
        if (this._diveCd <= 0 && dist < DETECT_R) {
          const len = dist > 0 ? dist : 1;
          this._diveVx = (dx / len) * DIVE_SPEED;
          this._diveVy = (dy / len) * DIVE_SPEED;
          this._diveTimer = DIVE_DUR;
          this.state = 'dive';
        }
        break;
      }

      case 'mark':
        this.gameObject.body.setVelocity(0, 0);
        this._markWind -= dt;
        if (this._markWind <= 0) {
          this._markTimer = MARK_DUR;
          this._markCd    = MARK_CD;
          this.state = 'circle';
        }
        break;

      case 'dive':
        this.gameObject.body.setVelocity(this._diveVx, this._diveVy);
        this._diveTimer -= dt;
        if (this._diveTimer <= 0) {
          this._diveCd = DIVE_CD;
          this.state = 'circle';
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
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (this.state !== 'dive') {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = (this.state === 'mark') ? 'circle' : this.state;
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
    this._restoreAura();
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _orbit(dx, dy, dist) {
    const len = dist > 0 ? dist : 1;
    // 접선(선회) + 약한 반경 보정으로 ORBIT_DIST 유지
    const perpX = (-dy / len) * this._orbitSign;
    const perpY = (dx  / len) * this._orbitSign;
    const radial = (dist - ORBIT_DIST) / ORBIT_DIST; // +면 너무 멈, -면 너무 가까움
    let vx = perpX + (dx / len) * radial;
    let vy = perpY + (dy / len) * radial;
    const m = Math.sqrt(vx * vx + vy * vy) || 1;
    const spd = ORBIT_SPEED * this.speedMult;
    this.gameObject.body.setVelocity((vx / m) * spd, (vy / m) * spd);
  }

  _updateAura() {
    const enemies    = this.scene.enemyManager?.enemies ?? [];
    const newTargets = new Set();
    for (const e of enemies) {
      if (e === this || !e.alive) continue;
      if (!(e.displayName && e.displayName.includes('사냥꾼'))) continue;
      const ex = e.x - this.gameObject.x;
      const ey = e.y - this.gameObject.y;
      if (ex * ex + ey * ey <= MARK_R * MARK_R) {
        e.speedMult = (e.baseSpeedMult ?? 1.0) * MARK_MULT;
        newTargets.add(e);
      }
    }
    for (const e of this._auraTargets) {
      if (!newTargets.has(e) && e.alive) e.speedMult = e.baseSpeedMult ?? 1.0;
    }
    this._auraTargets = newTargets;
  }

  _restoreAura() {
    for (const e of this._auraTargets) {
      if (e.alive) e.speedMult = e.baseSpeedMult ?? 1.0;
    }
    this._auraTargets.clear();
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 액션 상태도 전용 스프라이트 없이 이동 방향 스프라이트를 그대로 사용한다.
    const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    if (dir) this._lastDir = dir;
    const key = `crow-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(CROW_DW, CROW_DH);
      this._applyBodySize();
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(CROW_W / sx, CROW_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 18, CROW_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - CROW_DW / 2, y - 18, CROW_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 18);
    this._hpFill.setPosition(x - CROW_DW / 2, y - 18);
    this._hpFill.width = CROW_DW * Math.max(0, this.hp / this.maxHp);
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
    this._restoreAura();
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
