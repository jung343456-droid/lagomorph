/**
 * 활 사냥꾼 (BowHunter) — 원거리 조준 사격형 + 올가미 덫 (구역 3, 인간)
 * HP 45 / 속도 110 / 데미지 16(화살) / 코어 5
 *
 * 패턴:
 *   idle → kite(360px 이내 탐지)
 *   kite → 선호 거리 220px 유지(멀면 접근, 100px 이내 후퇴)
 *          2.2초마다 aim 진입 (HP 30% 이하: 1.4초)
 *          5초마다 플레이어 위치에 올가미 덫 설치
 *   aim  → 0.8초 정지 + 조준선 표시 (HP 30% 이하: 0.6초) → 화살 발사 후 kite
 *   stun → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 화살: 직선 360px/s, EnemyManager._enemyProjs 수동 이동(addEnemyProjectile)
 * 올가미 덫: 바닥 hazard(거미줄 패턴 재사용) — 플레이어 진입 시 Player.applyRoot(1s) 속박.
 *            사망 후에도 지속(매니저 _lingeringHazards) — 만료·dispose·방 전환 시 정리.
 * speedMult: 공용 속도 배수 경유 (접근·후퇴에 적용)
 */
const DETECT_R     = 360;
const PREFER_DIST  = 220;
const CLOSE_DIST   = 100;
const KITE_SPEED   = 110;
const AIM_CD       = 2.2;
const AIM_CD_RAGE  = 1.4;
const AIM_DUR      = 0.8;
const AIM_DUR_RAGE = 0.6;
const ARROW_SPEED  = 360;
const ARROW_SIZE   = 16;
const SNARE_CD     = 5.0;
const SNARE_R      = 40;    // 속박 판정 반경
const SNARE_IMG    = 80;    // snare 텍스처 표시 크기 (1:1)
const SNARE_DUR    = 6.0;
const SNARE_MAX    = 1;
const ROOT_DUR     = 1.0;
const BH_W         = 24;
const BH_H         = 40;
const BH_DW        = 40;
const BH_DH        = 56;

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

// 상태: idle | kite | aim | stun
export default class BowHunter {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 45;
    this.maxHp  = 45;
    this.speed  = KITE_SPEED;
    this.damage = 16;
    this.displayName = '활 사냥꾼';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 5;
    this.speedMult = 1.0;

    this._aimCd     = AIM_CD * (0.4 + Math.random() * 0.6);
    this._aimTimer  = 0;
    this._snareCd   = SNARE_CD * (0.5 + Math.random() * 0.5);
    this._snares    = [];   // [{ gfx, timer, x, y }]
    this._aimGfx    = null;
    this._player    = null;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'bowhunter-s';

    this.gameObject = scene.add.image(x, y, 'bowhunter-s').setDisplaySize(BH_DW, BH_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.setDepth(9);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    this._player = player;
    if (!this.alive) { this._tickSnares(delta / 1000, player); return; }
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const rage = this.hp / this.maxHp <= 0.3;

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'kite';
        break;

      case 'kite': {
        if (dist >= DETECT_R) { this.state = 'idle'; this.gameObject.body.setVelocity(0, 0); break; }
        const len = dist > 0 ? dist : 1;
        if (dist < CLOSE_DIST) {
          this.gameObject.body.setVelocity((-dx / len) * KITE_SPEED * this.speedMult, (-dy / len) * KITE_SPEED * this.speedMult);
        } else if (dist > PREFER_DIST) {
          this.gameObject.body.setVelocity((dx / len) * KITE_SPEED * this.speedMult, (dy / len) * KITE_SPEED * this.speedMult);
        } else {
          this.gameObject.body.setVelocity(0, 0);
        }
        this._aimCd -= dt;
        if (this._aimCd <= 0) {
          this.state = 'aim';
          this._aimTimer = rage ? AIM_DUR_RAGE : AIM_DUR;
          this.gameObject.body.setVelocity(0, 0);
        }
        this._snareCd -= dt;
        if (this._snareCd <= 0) {
          this._placeSnare(player.x, player.y);
          this._snareCd = SNARE_CD;
        }
        break;
      }

      case 'aim':
        this.gameObject.body.setVelocity(0, 0);
        this._drawAimLine(player);
        this._aimTimer -= dt;
        if (this._aimTimer <= 0) {
          this._fireArrow(dx, dy, dist);
          this._clearAimLine();
          this._aimCd = rage ? AIM_CD_RAGE : AIM_CD;
          this.state = 'kite';
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

    this._tickSnares(dt, player);
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
    this._prevState = (this.state === 'aim') ? 'kite' : this.state;
    this._clearAimLine();
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
    this._clearAimLine();
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.disposeHazards();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  /** 사망 후 잔존 올가미 갱신 — EnemyManager.update 가 _lingeringHazards 순회로 매 프레임 호출 */
  tickLingering(delta, player) {
    this._tickSnares(delta / 1000, player ?? this._player);
    if (this._snares.length === 0) this.disposeHazards();
  }

  /** 올가미 정리 — dispose() 및 EnemyManager.clearLingeringHazards() 공용 호출 */
  disposeHazards() {
    this._snares.forEach(s => { if (s.gfx?.active) s.gfx.destroy(); });
    this._snares = [];
    this.scene.enemyManager?.unregisterLingeringHazard?.(this);
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _fireArrow(dx, dy, dist) {
    const len = dist > 0 ? dist : 1;
    const nx  = dx / len;
    const ny  = dy / len;
    const proj = this.scene.add.image(this.gameObject.x, this.gameObject.y, 'hunter-arrow')
      .setDisplaySize(ARROW_SIZE, ARROW_SIZE / 2)
      .setRotation(Math.atan2(ny, nx))
      .setDepth(8);
    this.scene.enemyManager.addEnemyProjectile(
      proj, this.damage, nx * ARROW_SPEED, ny * ARROW_SPEED, '사냥꾼 화살', this.isElite,
    );
  }

  _drawAimLine(player) {
    if (!this._aimGfx) this._aimGfx = this.scene.add.graphics().setDepth(7);
    this._aimGfx.clear();
    this._aimGfx.lineStyle(1, 0xff5544, 0.7);
    this._aimGfx.lineBetween(this.gameObject.x, this.gameObject.y, player.x, player.y);
  }

  _clearAimLine() {
    if (this._aimGfx) { this._aimGfx.destroy(); this._aimGfx = null; }
  }

  _placeSnare(x, y) {
    const gfx = this.scene.add.image(x, y, 'snare').setDisplaySize(SNARE_IMG, SNARE_IMG).setDepth(7);
    this._snares.push({ gfx, timer: SNARE_DUR, x, y });
    while (this._snares.length > SNARE_MAX) {
      const old = this._snares.shift();
      if (old.gfx?.active) old.gfx.destroy();
    }
  }

  _tickSnares(dt, player) {
    this._snares = this._snares.filter(s => {
      s.timer -= dt;
      if (s.timer <= 0) { if (s.gfx?.active) s.gfx.destroy(); return false; }
      if (s.timer < 0.8 && s.gfx?.active) s.gfx.setAlpha(s.timer / 0.8);
      const dx = player.x - s.x;
      const dy = player.y - s.y;
      if (dx * dx + dy * dy < SNARE_R * SNARE_R) {
        player.applyRoot?.(ROOT_DUR);
      }
      return true;
    });
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 액션 상태도 전용 스프라이트 없이 이동 방향 스프라이트를 그대로 사용한다.
    const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    if (dir) this._lastDir = dir;
    const key = `bowhunter-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(BH_DW, BH_DH);
      this._applyBodySize();
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(BH_W / sx, BH_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 32, BH_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - BH_DW / 2, y - 32, BH_DW, 4, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 32);
    this._hpFill.setPosition(x - BH_DW / 2, y - 32);
    this._hpFill.width = BH_DW * Math.max(0, this.hp / this.maxHp);
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
    this._clearAimLine();
    this._hpBg.destroy();
    this._hpFill.destroy();
    const sx = this.gameObject.scaleX * 1.8;
    const sy = this.gameObject.scaleY * 1.8;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 260, ease: 'Quad.Out',
      onComplete: () => {
        this.gameObject.destroy();
        this.destroyed = true;
        if (this._snares.length > 0) this.scene.enemyManager?.registerLingeringHazard?.(this);
      },
    });
  }
}
