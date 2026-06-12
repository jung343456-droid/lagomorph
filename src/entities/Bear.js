/**
 * 곰 (Bear) — 중량 탱커 (구역 2)
 * HP 176 / 속도 121 / 데미지 22(휘두르기) / 코어 6
 *
 * 패턴:
 *   idle          → chase(282px 이내 탐지)
 *   chase         → 121px/s 추격 (격노 시 165px/s)
 *   swipe_windup  → 80px 이내 접근 시 0.2초 예고 (2타째는 0.15초 — 플레이어 방향 재조준)
 *   swipe         → 0.2초간 120px 반경 정면 120° 부채꼴 피해 (측면·등 뒤 안전), 시각 잔상 +0.1초
 *                   2회 연속 발동 — 타격마다 휘두르는 방향으로 200px/s 전진(한 걸음 ~40px), 타당 1회 피해
 *                   피격 스턴 시 콤보 취소(cooldown 으로 복귀)
 *   cooldown      → 1.8초 정지 (격노 시 1.0초)
 *   stun          → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 격노: HP 30% 이하 진입 시 속도 ×1.36 (121→165), swipe 쿨다운 ×0.56, 적색 틴트
 * 시각: 짙은 갈색 틴트 (placeholder: hedgehog 스프라이트 재사용)
 * speedMult: Wolf 오라(180px 이내) 적용 시 추격 속도 ×1.2 (격노 시 추가 적용)
 */
const DETECT_R       = 282;
const CHASE_SPEED    = 121;
const RAGE_SPEED     = 165;
const SWIPE_RANGE    = 80;
const SWIPE_RADIUS   = 120;
const SWIPE_HALF_ANGLE = Math.PI / 3;            // 부채꼴 반각 60° (전체 120°)
const SWIPE_DOT_MIN  = Math.cos(SWIPE_HALF_ANGLE); // 피해 판정 내적 하한 (0.5)
const SWIPE_DMG      = 22;
const SWIPE_PUSH     = 350;
const SWIPE_PUSH_DUR = 0.25;
const SWIPE_WINDUP   = 0.2;
const SWIPE_WINDUP_NEXT = 0.15; // 2타째 예고 — 1타보다 짧게, 플레이어 방향 재조준
const SWIPE_COUNT    = 2;       // 연속 발동 횟수
const SWIPE_STEP_SPEED = 200;   // 타격 중 전진 속도 (px/s) — SWIPE_DUR 0.2s 동안 한 걸음 ~40px
const SWIPE_DUR      = 0.2;
const SWIPE_AFTERIMAGE = 0.1;  // 시각 잔상 — 피해 판정은 SWIPE_DUR 끝에 종료
const SWIPE_CD       = 1.8;
const SWIPE_CD_RAGE  = 1.0;
const RAGE_HP_RATIO  = 0.3;
const BEAR_W         = 36;
const BEAR_H         = 32;
const BEAR_DW        = 60;
const BEAR_DH        = 56;
const TINT           = 0x4a3a25;
const TINT_RAGE      = 0x884422;
const SWIPE_COLOR    = 0xff6644;

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

// 상태: idle | chase | swipe_windup | swipe | cooldown | stun
export default class Bear {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 176;
    this.maxHp  = 176;
    this.speed  = CHASE_SPEED;
    this.damage = SWIPE_DMG;
    this.displayName = '곰';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 6;
    this.speedMult = 1.0;

    this._stateTimer = 0;
    this._swipeDir   = { x: 0, y: 1 };
    this._rage       = false;
    this._swipeHit   = false;  // 단일 swipe 회당 1회 피해
    this._swipesLeft = 0;      // 남은 연속 타격 수 (chase → windup 진입 시 SWIPE_COUNT 로 초기화)

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'bear-idle';

    this.gameObject = scene.add.image(x, y, 'bear-idle').setDisplaySize(BEAR_DW, BEAR_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.setDepth(9);
    this.gameObject.setTint(TINT);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (!this._rage && this.hp / this.maxHp <= RAGE_HP_RATIO) this._enterRage();

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'chase';
        break;

      case 'chase': {
        if (dist >= DETECT_R) { this.state = 'idle'; break; }
        if (dist < SWIPE_RANGE) {
          // swipe 콤보 시작
          const len = dist > 0 ? dist : 1;
          this._swipeDir = { x: dx / len, y: dy / len };
          this._swipesLeft = SWIPE_COUNT;
          this.state = 'swipe_windup';
          this._stateTimer = SWIPE_WINDUP;
          this.gameObject.body.setVelocity(0, 0);
          break;
        }
        const speed = (this._rage ? RAGE_SPEED : CHASE_SPEED) * this.speedMult;
        this._moveTo(dx, dy, dist, speed);
        break;
      }

      case 'swipe_windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'swipe';
          this._stateTimer = SWIPE_DUR;
          this._swipeHit = false;
          this._spawnSwipeGfx();
        }
        break;

      case 'swipe': {
        // 타격 중 휘두르는 방향으로 한 걸음 전진
        this.gameObject.body.setVelocity(
          this._swipeDir.x * SWIPE_STEP_SPEED,
          this._swipeDir.y * SWIPE_STEP_SPEED,
        );
        this._stateTimer -= dt;
        if (!this._swipeHit) {
          // 단일 데미지 적용: 부채꼴 내부 + 거리 이내
          const pdx = player.x - this.gameObject.x;
          const pdy = player.y - this.gameObject.y;
          const pd  = Math.sqrt(pdx * pdx + pdy * pdy);
          if (pd <= SWIPE_RADIUS && pd > 0) {
            const nx = pdx / pd;
            const ny = pdy / pd;
            const dot = nx * this._swipeDir.x + ny * this._swipeDir.y; // > cos60° → 정면 120° 부채꼴 내부
            if (dot > SWIPE_DOT_MIN) {
              this._swipeHit = true;
              const dead = player.takeDamage(SWIPE_DMG, {
                dx: nx, dy: ny, force: SWIPE_PUSH, duration: SWIPE_PUSH_DUR,
              });
              if (dead) this.scene.events.emit('player-dead');
            }
          }
        }
        if (this._stateTimer <= 0) {
          this._swipesLeft--;
          if (this._swipesLeft > 0) {
            // 다음 타: 플레이어 현재 위치로 재조준 후 짧은 예고
            const len = dist > 0 ? dist : 1;
            this._swipeDir = { x: dx / len, y: dy / len };
            this.state = 'swipe_windup';
            this._stateTimer = SWIPE_WINDUP_NEXT;
            this.gameObject.body.setVelocity(0, 0);
          } else {
            this.state = 'cooldown';
            this._stateTimer = this._rage ? SWIPE_CD_RAGE : SWIPE_CD;
          }
        }
        break;
      }

      case 'cooldown':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) this.state = dist < DETECT_R ? 'chase' : 'idle';
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
          this.gameObject.setTint(this._rage ? TINT_RAGE : TINT);
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
    if (knockback) {
      const { dx, dy, force, duration } = knockback;
      // 무거운 적: 넉백 50% 감산
      this._knockbackTimer    = duration * 0.5;
      this._knockbackDuration = duration * 0.5;
      this._knockbackVx = dx * force * 0.5;
      this._knockbackVy = dy * force * 0.5;
    }
    this._prevState = (this.state === 'swipe' || this.state === 'swipe_windup') ? 'cooldown' : this.state;
    if (this._prevState === 'cooldown') this._stateTimer = this._rage ? SWIPE_CD_RAGE : SWIPE_CD;
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

  _enterRage() {
    this._rage = true;
    this.gameObject.setTint(TINT_RAGE);
    this.scene.cameras.main.flash(200, 200, 60, 30, false);
  }

  _spawnSwipeGfx() {
    const gfx = this.scene.add.graphics().setDepth(8);
    let { x, y } = this.gameObject;
    const angle = Math.atan2(this._swipeDir.y, this._swipeDir.x);
    const state = { a: 0.6 };
    this.scene.tweens.add({
      targets: state, a: 0, duration: (SWIPE_DUR + SWIPE_AFTERIMAGE) * 1000, ease: 'Quad.Out',
      onUpdate: () => {
        // 타격 중 전진하므로 부채꼴을 곰 현재 위치에 추종 (피해 판정과 일치)
        if (this.gameObject?.active) { x = this.gameObject.x; y = this.gameObject.y; }
        gfx.clear();
        gfx.fillStyle(SWIPE_COLOR, state.a * 0.3);
        gfx.slice(x, y, SWIPE_RADIUS, angle - SWIPE_HALF_ANGLE, angle + SWIPE_HALF_ANGLE, false);
        gfx.fillPath();
        gfx.lineStyle(2.5, SWIPE_COLOR, state.a);
        gfx.beginPath();
        gfx.arc(x, y, SWIPE_RADIUS, angle - SWIPE_HALF_ANGLE, angle + SWIPE_HALF_ANGLE);
        gfx.strokePath();
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
    if (this.state === 'swipe' || this.state === 'swipe_windup') {
      key = 'bear-swipe';
    } else if (this.state === 'idle' || this.state === 'cooldown') {
      key = 'bear-idle';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `bear-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(BEAR_DW, BEAR_DH);
      this._applyBodySize();
      this.gameObject.setTint(this._rage ? TINT_RAGE : TINT);
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(BEAR_W / sx, BEAR_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 34, BEAR_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - BEAR_DW / 2, y - 34, BEAR_DW, 4, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 34);
    this._hpFill.setPosition(x - BEAR_DW / 2, y - 34);
    this._hpFill.width = BEAR_DW * Math.max(0, this.hp / this.maxHp);
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
        else { this.gameObject.clearTint(); this.gameObject.setTint(this._rage ? TINT_RAGE : TINT); }
      },
    });
  }

  _die() {
    this.alive = false;
    this.gameObject.body.setEnable(false);
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    this._hpBg.destroy();
    this._hpFill.destroy();
    const sx = this.gameObject.scaleX * 2.0;
    const sy = this.gameObject.scaleY * 2.0;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 320, ease: 'Quad.Out',
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
