/**
 * 사냥꾼 보스 ("수석 사냥꾼", HunterBoss) — 구역 3 표시 10층 / 구역 4 표시 10층 보스 (인간, 다페이즈)
 * HP 520 / 속도 150 / 데미지: 화살 18 · 단검 22 / 코어 22
 *
 * 페이즈 (HP 비율):
 *   P1 (100~60%): 원거리 조준 사격(aim→화살) + 올가미 덫 설치, 선호 거리 220px 카이팅
 *   P2 (60~30%) : 근접 단검 콤보(돌진 베기) 위주 + 진입 시 사냥개 2마리 소환(1회)
 *   P3 (<30%)   : 분노(속도 ×1.2) + 광역 화살(3발 부채꼴) 빈발 + 올가미
 *
 * 상태: idle | kite | aim | windup | lunge | stun
 * 화살: addEnemyProjectile(직선). 올가미: 거미줄 잔존 hazard 패턴(Player.applyRoot).
 *        덫 범위 안에서 근거리 공격(attack-fired) SNARE_BREAK_HITS(5)회 시 끊어져 즉시 해제(덫 제거 + Player.clearRoot).
 * 처치 처리: 방 타입('boss') + isBoss 플래그 → EnemyManager 가 코어/레어 드롭. 구역 4(40층)은 런 종료(GameScene).
 */
const DETECT_R     = 999;   // 보스방은 항상 교전
const PREFER_DIST  = 220;
const CLOSE_DIST   = 120;
const MOVE_SPEED   = 150;
const AIM_DUR      = 0.7;
const ARROW_SPEED  = 380;
const ARROW_DMG    = 18;
const ARROW_SIZE   = 18;
const DAGGER_DMG   = 22;
const LUNGE_SPEED  = 320;
const WINDUP_DUR   = 0.3;
const LUNGE_DUR    = 0.28;
const SNARE_R      = 42;
const SNARE_IMG    = 84;
const SNARE_DUR    = 6.0;
const SNARE_MAX    = 2;
const ROOT_DUR     = 1.0;
const SNARE_BREAK_HITS = 5;   // 덫 범위 안에서 근거리 공격 N회 시 덫 해제
const HB_W         = 40;
const HB_H         = 60;
const HB_DW        = 64;
const HB_DH        = 80;

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

// 상태: idle | kite | aim | windup | lunge | stun
export default class HunterBoss {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 520;
    this.maxHp  = 520;
    this.speed  = MOVE_SPEED;
    this.damage = DAGGER_DMG;   // 접촉 데미지(단검)
    this.displayName = '수석 사냥꾼';
    this.isBoss = true;

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 22;
    this.speedMult = 1.0;

    this._aimCd     = 1.4;
    this._aimTimer  = 0;
    this._aimFan    = false;
    this._snareCd   = 4.0;
    this._lungeCd   = 1.5;
    this._stateTimer = 0;
    this._lungeVx = 0;
    this._lungeVy = 0;
    this._summoned = false;
    this._snares   = [];
    this._aimGfx   = null;
    this._player   = null;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'hunterboss-s';

    this.gameObject = scene.add.image(x, y, 'hunterboss-s').setDisplaySize(HB_DW, HB_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.setDepth(10);

    // 근거리 공격으로 덫을 끊어내기 위한 구독 (덫이 사망 후에도 잔존하므로 disposeHazards 에서 해제)
    scene.events.on('attack-fired', this._onPlayerAttack, this);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  get phase() {
    const r = this.hp / this.maxHp;
    return r > 0.6 ? 1 : r > 0.3 ? 2 : 3;
  }

  update(delta, player) {
    this._player = player;
    if (!this.alive) { this._tickSnares(delta / 1000, player); return; }
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const phase = this.phase;
    if (phase >= 2 && !this._summoned) {
      this._summoned = true;
      this._summonHounds();
    }
    const rageSpd = phase === 3 ? 1.2 : 1;

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.state = 'kite';
        break;

      case 'kite': {
        this._moveKite(dx, dy, dist, phase, rageSpd);
        // P2: 근접 단검 콤보 우선
        if (phase === 2) {
          this._lungeCd -= dt;
          if (this._lungeCd <= 0 && dist < 160) {
            const len = dist > 0 ? dist : 1;
            this._lungeVx = (dx / len) * LUNGE_SPEED;
            this._lungeVy = (dy / len) * LUNGE_SPEED;
            this.state = 'windup';
            this._stateTimer = WINDUP_DUR;
            this.gameObject.body.setVelocity(0, 0);
            break;
          }
        }
        // 조준 사격 (P1·P3 위주, P2 도 가끔)
        this._aimCd -= dt;
        if (this._aimCd <= 0) {
          this._aimFan = phase === 3;
          this.state = 'aim';
          this._aimTimer = AIM_DUR;
          this.gameObject.body.setVelocity(0, 0);
          break;
        }
        // 올가미 (P1·P3)
        if (phase !== 2) {
          this._snareCd -= dt;
          if (this._snareCd <= 0) { this._placeSnare(player.x, player.y); this._snareCd = 4.5; }
        }
        break;
      }

      case 'aim':
        this.gameObject.body.setVelocity(0, 0);
        this._drawAimLine(player);
        this._aimTimer -= dt;
        if (this._aimTimer <= 0) {
          this._clearAimLine();
          if (this._aimFan) this._fireFan(dx, dy, dist);
          else this._fireArrow(dx, dy, dist, 0);
          this._aimCd = phase === 3 ? 1.1 : 1.8;
          this.state = 'kite';
        }
        break;

      case 'windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) { this.state = 'lunge'; this._stateTimer = LUNGE_DUR; }
        break;

      case 'lunge':
        this.gameObject.body.setVelocity(this._lungeVx, this._lungeVy);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this._lungeCd = 1.4;
          this.state = 'kite';
          this.gameObject.body.setVelocity(0, 0);
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
    // 보스는 돌진 중 경직 면역, 그 외엔 짧은 경직(넉백은 약하게 적용 안 함 — 보스 무게감)
    if (this.state !== 'lunge') {
      this._prevState = (this.state === 'aim' || this.state === 'windup') ? 'kite' : this.state;
      this._clearAimLine();
      this.state      = 'stun';
      this.stunTimer  = 0.2;
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
    this._clearAimLine();
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.disposeHazards();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  tickLingering(delta, player) {
    this._tickSnares(delta / 1000, player ?? this._player);
    if (this._snares.length === 0) this.disposeHazards();
  }

  disposeHazards() {
    this._snares.forEach(s => { if (s.gfx?.active) s.gfx.destroy(); });
    this._snares = [];
    this.scene.events.off('attack-fired', this._onPlayerAttack, this);
    this.scene.enemyManager?.unregisterLingeringHazard?.(this);
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _moveKite(dx, dy, dist, phase, rageSpd) {
    const len = dist > 0 ? dist : 1;
    const spd = MOVE_SPEED * this.speedMult * rageSpd;
    if (phase === 2) {
      // 추격 (단검 거리 확보)
      this.gameObject.body.setVelocity((dx / len) * spd, (dy / len) * spd);
    } else if (dist < CLOSE_DIST) {
      this.gameObject.body.setVelocity((-dx / len) * spd, (-dy / len) * spd);
    } else if (dist > PREFER_DIST) {
      this.gameObject.body.setVelocity((dx / len) * spd, (dy / len) * spd);
    } else {
      this.gameObject.body.setVelocity(0, 0);
    }
  }

  _summonHounds() {
    const em = this.scene.enemyManager;
    if (!em?.spawnEnemy) return;
    const bx = this.gameObject.x, by = this.gameObject.y;
    [-60, 60].forEach(off => {
      const h = em.spawnEnemy('hound', bx + off, by + 40);
      if (h) h.gameObject.body.setMaxVelocity(420, 420);
    });
  }

  _fireArrow(dx, dy, dist, angleOffsetDeg) {
    const base = Math.atan2(dy, dx) + (angleOffsetDeg * Math.PI / 180);
    const nx = Math.cos(base), ny = Math.sin(base);
    const proj = this.scene.add.image(this.gameObject.x, this.gameObject.y, 'hunter-arrow')
      .setDisplaySize(ARROW_SIZE, ARROW_SIZE / 2)
      .setRotation(base)
      .setDepth(8);
    this.scene.enemyManager.addEnemyProjectile(proj, ARROW_DMG, nx * ARROW_SPEED, ny * ARROW_SPEED, '사냥꾼 화살', this.isElite);
  }

  _fireFan(dx, dy, dist) {
    [-15, 0, 15].forEach(a => this._fireArrow(dx, dy, dist, a));
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
    this._snares.push({ gfx, timer: SNARE_DUR, x, y, struggle: 0 });
    while (this._snares.length > SNARE_MAX) {
      const old = this._snares.shift();
      if (old.gfx?.active) old.gfx.destroy();
    }
  }

  _tickSnares(dt, player) {
    this._snares = this._snares.filter(s => {
      s.timer -= dt;
      if (s.timer <= 0) { if (s.gfx?.active) s.gfx.destroy(); return false; }
      // 만료 페이드와 struggle(끊기 진행도)을 함께 반영 — 더 옅은 쪽을 적용
      if (s.gfx?.active) {
        const timerA    = s.timer < 0.8 ? s.timer / 0.8 : 1;
        const struggleA = 1 - 0.55 * (s.struggle / SNARE_BREAK_HITS);
        s.gfx.setAlpha(Math.min(timerA, struggleA));
      }
      const dx = player.x - s.x;
      const dy = player.y - s.y;
      if (dx * dx + dy * dy < SNARE_R * SNARE_R) player.applyRoot?.(ROOT_DUR);
      return true;
    });
  }

  /** 근거리 공격(attack-fired): 덫 범위 안에서 맞으면 끊기 진행 — 5회째에 덫 제거 + 속박 즉시 해제. */
  _onPlayerAttack({ playerX, playerY }) {
    this._snares = this._snares.filter(s => {
      const dx = playerX - s.x;
      const dy = playerY - s.y;
      if (dx * dx + dy * dy >= SNARE_R * SNARE_R) return true;   // 덫 밖 공격 — 무관
      if (++s.struggle < SNARE_BREAK_HITS) return true;
      if (s.gfx?.active) s.gfx.destroy();
      this._player?.clearRoot?.();   // 끊어낸 즉시 이동 가능
      return false;
    });
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 액션 상태도 전용 스프라이트 없이 이동 방향 스프라이트를 그대로 사용한다.
    const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    if (dir) this._lastDir = dir;
    const key = `hunterboss-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(HB_DW, HB_DH);
      this._applyBodySize();
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(HB_W / sx, HB_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 46, HB_DW, 5, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - HB_DW / 2, y - 46, HB_DW, 5, 0xff4444)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 46);
    this._hpFill.setPosition(x - HB_DW / 2, y - 46);
    this._hpFill.width = HB_DW * Math.max(0, this.hp / this.maxHp);
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
    this._clearAimLine();
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    this._hpBg.destroy();
    this._hpFill.destroy();
    const sx = this.gameObject.scaleX * 1.8;
    const sy = this.gameObject.scaleY * 1.8;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 320, ease: 'Quad.Out',
      onComplete: () => {
        this.gameObject.destroy();
        this.destroyed = true;
        if (this._snares.length > 0) this.scene.enemyManager?.registerLingeringHazard?.(this);
      },
    });
  }
}
