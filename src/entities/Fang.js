/**
 * FANG — 구역 1 보스
 * HP 800 / 크기 64×64px
 *
 * 인지 범위: 방 어디서든 즉시 추적·공격 (DETECT_R 없음)
 * 이동속도: 1페이즈 198px/s / 2페이즈 242px/s (≈+22%, 플레이어 200 기준)
 * 1페이즈 (HP 100~50%) — 패턴 풀: dash×2 + dash_combo + stomp + roar (돌진계 60%):
 *   dash         → 플레이어 방향 484px/s 직진, 벽 충돌까지 최대 사거리 이동
 *                  장애물 충돌 시 장애물 파괴 후 돌진 지속, 벽 충돌 시 220px/s 자기 반동(0.2초 감쇠) + 1.5초 스턴
 *                  안전상 MAX 2.5초 캡 (room diagonal 통과 분)
 *   dash_combo   → 3연속 돌진 (각 dash 사이 재조준)
 *   stomp        → 0.6초 예고 후 반경 150px AoE (데미지 20 + 넉백)
 *   roar         → 반경 200px 내 플레이어 0.5초 기절 (데미지 없음)
 * 2페이즈 (HP 50% 이하) — 패턴 풀: dash_combo×2 + dash + stomp + roar (콤보 40%):
 *   분노 플래시, 이동속도 +22%, dash_combo 5연속
 *   패턴 간격 30% 단축, 스프라이트 적색 틴트
 * 패턴 쿨다운: 1페 1.5~2.5s / 2페 1.05~1.75s
 * 처치: 코어 50개 + 레어 아이템 드롭
 */

const FANG_W            = 50;
const FANG_H            = 50;
const FANG_DW           = 88;
const FANG_DH           = 88;

const BASE_CHASE_SPEED  = 198;
const DASH_SPEED        = 484;
const DASH_DURATION_MAX     = 2.5;  // 벽/막힘까지 직진하기 위한 안전 캡 (room diagonal 통과)
const WALL_STUN_DUR     = 1.5;
const WALL_BOUNCE_FORCE = 220;  // 벽 충돌 시 자기 반동 초속
const WALL_BOUNCE_DUR   = 0.2;  // 반동 감쇠 시간
const HIT_STUN_DUR      = 0.3;

const STOMP_WINDUP      = 0.6;
const STOMP_RADIUS      = 150;
const STOMP_DMG         = 20;
const STOMP_PUSH        = 380;
const STOMP_PUSH_DUR    = 0.3;

const ROAR_RADIUS       = 200;
const ROAR_STUN_DUR     = 0.5;
const ROAR_DUR          = 0.8;

const PATTERN_CD_MIN    = 1.5;
const PATTERN_CD_MAX    = 2.5;
const PHASE2_SPEED_MULT = 1.22;       // 198 × 1.22 ≈ 242
const COMBO_COUNT_P1    = 3;          // 1페 콤보 돌진 횟수
const COMBO_COUNT_P2    = 5;          // 2페 콤보 돌진 횟수
const PHASE2_TINT       = 0xff6666;   // 2페이즈 스프라이트 틴트

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

// 상태: idle | dash | combo_dash | wallstun | stomp_windup | roar | stun
export default class Fang {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 800;
    this.maxHp  = 800;
    this.speed  = BASE_CHASE_SPEED;
    this.damage = 25;
    this.displayName = 'FANG';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 50;
    this.isBoss      = true;
    this.isFinalBoss = true;

    this._phase         = 1;
    this._patternCd     = 1.0;
    this._player        = null;

    this._dashDir       = { x: 0, y: 1 };
    this._dashTimer     = 0;
    this._wallStunTimer = 0;
    this._bounceTimer   = 0;
    this._bounceVx      = 0;
    this._bounceVy      = 0;

    this._comboRemaining = 0;
    this._comboDelay     = 0;

    this._stompTimer    = 0;
    this._stompGfx      = null;

    this._roarTimer     = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._hitObstacle = false;

    this._lastDir = 's';
    this._curKey  = 'fang-s';

    this.gameObject = scene.add.image(x, y, 'fang-s').setDisplaySize(FANG_DW, FANG_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.body.setMaxVelocity(450, 450);
    this.gameObject.setDepth(9);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this._player = player;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (this._phase === 1 && this.hp / this.maxHp <= 0.5) this._enterPhase2();

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this._patternCd -= dt;
        this._chasePlayer(dx, dy, dist);
        if (this._patternCd <= 0) this._startNextPattern(dx, dy, dist, player);
        break;

      case 'dash':
        this._dashTimer -= dt;
        this.gameObject.body.setVelocity(this._dashDir.x * DASH_SPEED, this._dashDir.y * DASH_SPEED);
        if (this._dashTimer < DASH_DURATION_MAX - 0.08 && this._isWallBlocked()) {
          this._startWallStun(); break;
        }
        if (this._dashTimer <= 0) this._endPattern();
        break;

      case 'combo_dash':
        this._dashTimer -= dt;
        this.gameObject.body.setVelocity(this._dashDir.x * DASH_SPEED, this._dashDir.y * DASH_SPEED);
        if (this._dashTimer < DASH_DURATION_MAX - 0.08 && this._isWallBlocked()) {
          this._comboRemaining = 0; this._startWallStun(); break;
        }
        if (this._dashTimer <= 0) {
          if (this._comboRemaining > 0) {
            this._comboRemaining--;
            this._aimDashAt(player);
          } else {
            this._endPattern();
          }
        }
        break;

      case 'wallstun':
        if (this._bounceTimer > 0) {
          this._bounceTimer -= dt;
          const t = Math.max(0, this._bounceTimer) / WALL_BOUNCE_DUR;
          this.gameObject.body.setVelocity(this._bounceVx * t, this._bounceVy * t);
        } else {
          this.gameObject.body.setVelocity(0, 0);
        }
        this._wallStunTimer -= dt;
        if (this._wallStunTimer <= 0) this._endPattern();
        break;

      case 'stomp_windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stompTimer -= dt;
        this._updateStompGfx(1 - this._stompTimer / STOMP_WINDUP);
        if (this._stompTimer <= 0) this._triggerStomp(player);
        break;

      case 'roar':
        this.gameObject.body.setVelocity(0, 0);
        this._roarTimer -= dt;
        if (this._roarTimer <= 0) this._endPattern();
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
          if (this._phase === 2) this.gameObject.setTint(PHASE2_TINT);
          else this.gameObject.clearTint();
          this.state = this._prevState;
        }
        break;
    }

    this._updateSprite();
    this._syncHpBar();
  }

  takeDamage(amount, knockback = null) {
    if (!this.alive || this.state === 'stun' || this.state === 'wallstun') return false;

    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) { this._die(); return true; }

    const isDashing = this.state === 'dash' || this.state === 'combo_dash'
                   || this.state === 'stomp_windup' || this.state === 'roar';
    if (!isDashing) {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration * 0.35;
        this._knockbackDuration = duration * 0.35;
        this._knockbackVx = dx * force * 0.35;
        this._knockbackVy = dy * force * 0.35;
      }
      this._prevState = this.state;
      this.state = 'stun';
      this.stunTimer = HIT_STUN_DUR;
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
    if (this._stompGfx?.active) this._stompGfx.destroy();
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.alive = false;
    if (this.gameObject?.active) this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _chasePlayer(dx, dy, dist) {
    if (dist < 1) return;
    this.gameObject.body.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
  }

  _isWallBlocked() {
    if (this._hitObstacle) { this._hitObstacle = false; return false; }
    const b = this.gameObject.body;
    if (!b.blocked.none) return true;
    return b.velocity.length() < DASH_SPEED * 0.4;
  }

  _aimDashAt(player) {
    const dx  = player.x - this.gameObject.x;
    const dy  = player.y - this.gameObject.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this._dashDir = { x: dx / len, y: dy / len };
    this._dashTimer = DASH_DURATION_MAX;
  }

  _startNextPattern(dx, dy, dist, player) {
    const len  = dist || 1;
    // 돌진 비중 강화 — 1페: dash×2 + combo + stomp + roar (돌진계 60%)
    //              2페: dash_combo×2 + dash + stomp + roar (콤보 40%)
    const pool = this._phase === 2
      ? ['dash_combo', 'dash_combo', 'dash', 'stomp', 'roar']
      : ['dash', 'dash', 'dash_combo', 'stomp', 'roar'];
    const pick = pool[Math.floor(Math.random() * pool.length)];

    switch (pick) {
      case 'dash':
        this._dashDir = { x: dx / len, y: dy / len };
        this._dashTimer = DASH_DURATION_MAX;
        this.state = 'dash';
        break;

      case 'dash_combo': {
        const count = this._phase === 2 ? COMBO_COUNT_P2 : COMBO_COUNT_P1;
        this._comboRemaining = count - 1;
        this._aimDashAt(player);
        this.state = 'combo_dash';
        break;
      }

      case 'stomp':
        this._stompTimer = STOMP_WINDUP;
        this._spawnStompGfx();
        this.state = 'stomp_windup';
        break;

      case 'roar':
        this._doRoar(dist, player);
        break;
    }
  }

  _endPattern() {
    this.state = 'idle';
    this.gameObject.body.setVelocity(0, 0);
    const base = PATTERN_CD_MIN + Math.random() * (PATTERN_CD_MAX - PATTERN_CD_MIN);
    this._patternCd = this._phase === 2 ? base * 0.7 : base;
  }

  _startWallStun() {
    this.state = 'wallstun';
    this._wallStunTimer = WALL_STUN_DUR;
    // 돌진 반대 방향으로 반동
    this._bounceTimer = WALL_BOUNCE_DUR;
    this._bounceVx = -this._dashDir.x * WALL_BOUNCE_FORCE;
    this._bounceVy = -this._dashDir.y * WALL_BOUNCE_FORCE;
    this.gameObject.setTint(0x666666);
    this.scene.cameras.main.shake(300, 0.015);
  }

  // ── 패턴: 발 구름 ────────────────────────────────────

  _spawnStompGfx() {
    this._stompGfx = this.scene.add.graphics().setDepth(8);
  }

  _updateStompGfx(progress) {
    if (!this._stompGfx?.active) return;
    const r = STOMP_RADIUS * progress;
    const { x, y } = this.gameObject;
    this._stompGfx.clear();
    this._stompGfx.fillStyle(0xff6600, 0.05 + progress * 0.1);
    this._stompGfx.fillCircle(x, y, r);
    this._stompGfx.lineStyle(3, 0xff6600, 0.4 + progress * 0.5);
    this._stompGfx.strokeCircle(x, y, r);
  }

  _triggerStomp(player) {
    if (this._stompGfx?.active) { this._stompGfx.destroy(); this._stompGfx = null; }
    this.scene.cameras.main.shake(250, 0.02);

    const { x, y } = this.gameObject;
    const gfx = this.scene.add.graphics().setDepth(8);
    const state = { a: 0.7 };
    this.scene.tweens.add({
      targets: state, a: 0, duration: 350, ease: 'Quad.Out',
      onUpdate: () => {
        gfx.clear();
        gfx.fillStyle(0xff6600, state.a * 0.3);
        gfx.fillCircle(x, y, STOMP_RADIUS);
        gfx.lineStyle(4, 0xff6600, state.a);
        gfx.strokeCircle(x, y, STOMP_RADIUS);
      },
      onComplete: () => gfx.destroy(),
    });

    const dx = player.x - x, dy = player.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= STOMP_RADIUS) {
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;
      const dead = player.takeDamage(STOMP_DMG, { dx: nx, dy: ny, force: STOMP_PUSH, duration: STOMP_PUSH_DUR });
      if (dead) this.scene.events.emit('player-dead');
    }

    this._endPattern();
  }

  // ── 패턴: 포효 ───────────────────────────────────────

  _doRoar(dist, player) {
    this.state = 'roar';
    this._roarTimer = ROAR_DUR;
    this.gameObject.setTint(0xffaa00);
    this.scene.time.delayedCall(250, () => {
      if (!this.alive) return;
      if (this._phase === 2) this.gameObject.setTint(PHASE2_TINT);
      else this.gameObject.clearTint();
    });

    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 130, () => {
        if (!this.alive) return;
        const gfx   = this.scene.add.graphics().setDepth(8);
        const state = { r: 24, a: 0.8 };
        this.scene.tweens.add({
          targets: state, r: ROAR_RADIUS, a: 0, duration: 480, ease: 'Quad.Out',
          onUpdate: () => {
            gfx.clear();
            gfx.lineStyle(3, 0xffaa00, state.a);
            gfx.strokeCircle(this.gameObject.x, this.gameObject.y, state.r);
          },
          onComplete: () => gfx.destroy(),
        });
      });
    }

    if (dist <= ROAR_RADIUS) player.stun(ROAR_STUN_DUR);
  }

  // ── 2페이즈 진입 ─────────────────────────────────────

  _enterPhase2() {
    this._phase  = 2;
    this.speed   = BASE_CHASE_SPEED * PHASE2_SPEED_MULT;
    this.state   = 'idle';
    this.gameObject.body.setVelocity(0, 0);
    if (this._stompGfx?.active) { this._stompGfx.destroy(); this._stompGfx = null; }
    this._patternCd = 0.8;

    this.gameObject.setTexture('fang-rage').setDisplaySize(FANG_DW, FANG_DH);
    this._applyBodySize();
    this._curKey = 'fang-rage';
    this.scene.cameras.main.flash(450, 255, 0, 0, false);
  }

  // ── 스프라이트 ────────────────────────────────────────

  _updateSprite() {
    if (this.state === 'stun' || this.state === 'wallstun') return;
    let key;
    if (this.state === 'dash' || this.state === 'combo_dash') {
      key = 'fang-dash';
    } else if (this.state === 'stomp_windup') {
      key = 'fang-stomp';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `fang-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(FANG_DW, FANG_DH);
      this._applyBodySize();
    }
    if (this._phase === 2) this.gameObject.setTint(PHASE2_TINT);
  }

  // body.setSize 는 source 픽셀이라 setDisplaySize 로 확대된 작은 텍스처 위에선 body 가 부풀려진다.
  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(FANG_W / sx, FANG_H / sy, true);
  }

  // ── HP 바 ─────────────────────────────────────────────

  _buildHpBar() {
    const { x, y } = this.gameObject;
    const barY = y - FANG_DH / 2 - 10;
    this._hpBg   = this.scene.add.rectangle(x, barY, FANG_DW, 6, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - FANG_DW / 2, barY, FANG_DW, 6, 0xff4444)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    const barY = y - FANG_DH / 2 - 10;
    this._hpBg.setPosition(x, barY);
    this._hpFill.setPosition(x - FANG_DW / 2, barY);
    this._hpFill.width = FANG_DW * Math.max(0, this.hp / this.maxHp);
    const vis = this.hp < this.maxHp;
    this._hpBg.setVisible(vis);
    this._hpFill.setVisible(vis);
  }

  _blinkHit() {
    if (this._blinkEvent) this._blinkEvent.remove();
    let flip = 0;
    this.gameObject.setTintFill(0xffffff);
    this._blinkEvent = this.scene.time.addEvent({
      delay: 55, repeat: 3,
      callback: () => {
        if (this.destroyed) return;
        flip++;
        if (flip % 2 === 0) this.gameObject.setTintFill(0xffffff);
        else {
          if (this._phase === 2) this.gameObject.setTint(PHASE2_TINT);
          else this.gameObject.clearTint();
        }
      },
    });
  }

  _die() {
    this.alive = false;
    this.gameObject.body.setEnable(false);
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    if (this._stompGfx?.active) this._stompGfx.destroy();
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();

    this.scene.cameras.main.flash(600, 255, 255, 255, false);
    this.scene.cameras.main.shake(500, 0.03);

    const sx = this.gameObject.scaleX * 3.0;
    const sy = this.gameObject.scaleY * 3.0;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 700, ease: 'Quad.Out',
      onComplete: () => {
        if (this.gameObject?.active) this.gameObject.destroy();
        this.destroyed = true;
      },
    });
  }
}
