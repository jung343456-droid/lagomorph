/**
 * FANG — 구역 1 보스
 * HP 500 / 크기 64×64px
 *
 * 이동속도: 1페이즈 150px/s / 2페이즈 180px/s (+20%)
 * 1페이즈 (HP 100~50%):
 *   dash         → 플레이어 방향 400px/s 돌진, 벽 충돌 시 2초 스턴
 *                  장애물 충돌 시 장애물 파괴 후 돌진 지속
 *   stomp        → 0.8초 예고 후 반경 150px AoE (데미지 20 + 넉백)
 *   roar         → 반경 200px 내 플레이어 0.5초 기절 (데미지 없음)
 * 2페이즈 (HP 50% 이하):
 *   분노 플래시, 이동속도 +20%, 돌진 5회 콤보
 *   패턴 간격 30% 단축, 스프라이트 적색 틴트
 * 처치: 코어 50개 + 레어 아이템 드롭
 */
import { ROOM_W, ROOM_H, WALL_T } from '../world/Room';

const FANG_W            = 50;
const FANG_H            = 50;
const FANG_DW           = 88;
const FANG_DH           = 88;

const BASE_CHASE_SPEED  = 150;
const DASH_SPEED        = 400;
const DASH_DURATION     = 0.35;
const WALL_STUN_DUR     = 2.0;
const HIT_STUN_DUR      = 0.35;

const STOMP_WINDUP      = 0.8;
const STOMP_RADIUS      = 150;
const STOMP_DMG         = 20;
const STOMP_PUSH        = 380;
const STOMP_PUSH_DUR    = 0.3;

const ROAR_RADIUS       = 200;
const ROAR_STUN_DUR     = 0.5;
const ROAR_DUR          = 0.8;

const ROOM_STOMP_WINDUP   = 1.2;
const ROOM_STOMP_DMG      = 15;
const ROOM_STOMP_PUSH     = 300;
const ROOM_STOMP_PUSH_DUR = 0.25;
const ROOM_SAFE_MARGIN    = WALL_T + 18;

const PATTERN_CD_MIN    = 3.0;
const PATTERN_CD_MAX    = 5.0;
const PHASE2_SPEED_MULT = 1.2;
const COMBO_COUNT       = 5;
const PHASE2_TINT       = 0xff6666;  // 2페이즈 스프라이트 틴트

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

// 상태: idle | dash | combo_dash | wallstun | stomp_windup | roar | room_stomp_windup | stun
export default class Fang {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 500;
    this.maxHp  = 500;
    this.speed  = BASE_CHASE_SPEED;
    this.damage = 25;

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 50;
    this.isBoss    = true;

    this._phase         = 1;
    this._patternCd     = 2.0;
    this._player        = null;

    this._dashDir       = { x: 0, y: 1 };
    this._dashTimer     = 0;
    this._wallStunTimer = 0;

    this._comboRemaining = 0;
    this._comboDelay     = 0;

    this._stompTimer    = 0;
    this._stompGfx      = null;

    this._roarTimer     = 0;

    this._roomStompTimer = 0;
    this._roomStompGfx   = null;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._hitObstacle = false;

    this._lastDir = 's';
    this._curKey  = 'fang-s';

    this.gameObject = scene.add.image(x, y, 'fang-s').setDisplaySize(FANG_DW, FANG_DH);
    scene.physics.add.existing(this.gameObject);
    this.gameObject.body.setSize(FANG_W, FANG_H);
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
        if (this._dashTimer < DASH_DURATION - 0.08 && this._isWallBlocked()) {
          this._startWallStun(); break;
        }
        if (this._dashTimer <= 0) this._endPattern();
        break;

      case 'combo_dash':
        this._dashTimer -= dt;
        this.gameObject.body.setVelocity(this._dashDir.x * DASH_SPEED, this._dashDir.y * DASH_SPEED);
        if (this._dashTimer < DASH_DURATION - 0.08 && this._isWallBlocked()) {
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
        this.gameObject.body.setVelocity(0, 0);
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

      case 'room_stomp_windup':
        this.gameObject.body.setVelocity(0, 0);
        this._roomStompTimer -= dt;
        if (this._roomStompTimer <= 0) this._triggerRoomStomp(player);
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
    if (this._stompGfx?.active)     this._stompGfx.destroy();
    if (this._roomStompGfx?.active) this._roomStompGfx.destroy();
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
    this._dashTimer = DASH_DURATION;
  }

  _startNextPattern(dx, dy, dist, player) {
    const len  = dist || 1;
    const pool = this._phase === 2
      ? ['dash_combo', 'stomp', 'roar']
      : ['dash', 'stomp', 'roar'];
    const pick = pool[Math.floor(Math.random() * pool.length)];

    switch (pick) {
      case 'dash':
        this._dashDir = { x: dx / len, y: dy / len };
        this._dashTimer = DASH_DURATION;
        this.state = 'dash';
        break;

      case 'dash_combo':
        this._comboRemaining = COMBO_COUNT - 1;
        this._aimDashAt(player);
        this.state = 'combo_dash';
        break;

      case 'stomp':
        this._stompTimer = STOMP_WINDUP;
        this._spawnStompGfx();
        this.state = 'stomp_windup';
        break;

      case 'roar':
        this._doRoar(dist, player);
        break;

      case 'room_stomp':
        this._roomStompTimer = ROOM_STOMP_WINDUP;
        this._spawnRoomStompGfx();
        this.state = 'room_stomp_windup';
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
    this.gameObject.body.setVelocity(0, 0);
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

  // ── 패턴: 방 전체 충격파 (2페이즈) ─────────────────────

  _spawnRoomStompGfx() {
    this._roomStompGfx = this.scene.add.graphics().setDepth(8);
    const state = { a: 0 };
    this.scene.tweens.add({
      targets: state, a: 0.28, duration: ROOM_STOMP_WINDUP * 1000, ease: 'Linear',
      onUpdate: () => {
        if (!this._roomStompGfx?.active) return;
        this._roomStompGfx.clear();
        this._roomStompGfx.fillStyle(0xff2200, state.a);
        this._roomStompGfx.fillRect(WALL_T, WALL_T, ROOM_W - WALL_T * 2, ROOM_H - WALL_T * 2);
      },
    });
  }

  _triggerRoomStomp(player) {
    if (this._roomStompGfx?.active) { this._roomStompGfx.destroy(); this._roomStompGfx = null; }
    this.scene.cameras.main.shake(400, 0.025);

    const gfx   = this.scene.add.graphics().setDepth(8);
    const state = { a: 0.6 };
    this.scene.tweens.add({
      targets: state, a: 0, duration: 400, ease: 'Quad.Out',
      onUpdate: () => {
        gfx.clear();
        gfx.fillStyle(0xff2200, state.a);
        gfx.fillRect(WALL_T, WALL_T, ROOM_W - WALL_T * 2, ROOM_H - WALL_T * 2);
      },
      onComplete: () => gfx.destroy(),
    });

    const px = player.x, py = player.y;
    const safe = px < ROOM_SAFE_MARGIN || px > ROOM_W - ROOM_SAFE_MARGIN ||
                 py < ROOM_SAFE_MARGIN || py > ROOM_H - ROOM_SAFE_MARGIN;
    if (!safe) {
      const dx = px - this.gameObject.x, dy = py - this.gameObject.y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 1;
      const dead = player.takeDamage(ROOM_STOMP_DMG, {
        dx: dx / d, dy: dy / d, force: ROOM_STOMP_PUSH, duration: ROOM_STOMP_PUSH_DUR,
      });
      if (dead) this.scene.events.emit('player-dead');
    }

    this._endPattern();
  }

  // ── 2페이즈 진입 ─────────────────────────────────────

  _enterPhase2() {
    this._phase  = 2;
    this.speed   = BASE_CHASE_SPEED * PHASE2_SPEED_MULT;
    this.state   = 'idle';
    this.gameObject.body.setVelocity(0, 0);
    if (this._stompGfx?.active)     { this._stompGfx.destroy();     this._stompGfx     = null; }
    if (this._roomStompGfx?.active) { this._roomStompGfx.destroy(); this._roomStompGfx = null; }
    this._patternCd = 1.5;

    this.gameObject.setTexture('fang-rage').setDisplaySize(FANG_DW, FANG_DH);
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
    }
    if (this._phase === 2) this.gameObject.setTint(PHASE2_TINT);
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
    if (this._stompGfx?.active)     this._stompGfx.destroy();
    if (this._roomStompGfx?.active) this._roomStompGfx.destroy();
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
