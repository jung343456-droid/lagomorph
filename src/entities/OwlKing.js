/**
 * 부엉이왕 (OwlKing) — 구역 2 최종 보스 (10층)
 * HP 960 / 크기 80×80px
 *
 * 인지 범위: 방 어디서든 즉시 추적·공격 (DETECT_R 없음)
 * 이동속도: 220px/s (비행)
 * 페이즈:
 *   Phase 1 (HP 100~60%) — 공중 정찰: shadow_dive(50%) + feather_volley(30%) + screech(20%)
 *   Phase 2 (HP 60~30%)  — 회오리 추가: + whirlwind(25%), shadow_dive 인디케이터 1.0→0.7s 단축
 *   Phase 3 (HP <30%)    — 광폭화: 첫 진입 시 박쥐 4 소환, 쿨다운 ×0.6, dive 인디케이터 0.4s, volley 16방향
 *
 * 패턴:
 *   shadow_dive  → 지면 그림자 인디케이터 후 직선 강하 418px/s × 0.5s
 *                  강하 중 무적, 데미지 28, 착지 후 0.4초 경직
 *   feather_volley → 0.5초 정지 후 N방향 깃털 투사체 (각 220px/s, 데미지 12)
 *                    Phase 1·2: 8방향 / Phase 3: 16방향
 *   screech      → 0.4초 예고 → 반경 220px AoE → 플레이어 0.6초 기절 (데미지 없음)
 *   whirlwind    → 반경 240px 흡인장(2.0초, 120px/s²) + 동시에 깃털 4발 산개
 * 패턴 쿨다운: 1·2페 1.6~2.4s / 3페 ×0.6
 * 처치: 코어 60개 + 레어 아이템 드롭 → ZONE 2 CLEAR 트리거
 */
import { ROOM_W, ROOM_H, WALL_T } from '../world/Room';

const OK_W              = 56;
const OK_H              = 56;
const OK_DW             = 92;
const OK_DH             = 92;

const BASE_SPEED        = 220;
const DIVE_SPEED        = 418;
const DIVE_DURATION     = 0.5;
const DIVE_RECOVER      = 0.4;
const DIVE_DMG          = 28;
const DIVE_PUSH         = 360;
const DIVE_PUSH_DUR     = 0.25;
const DIVE_IND_P1       = 1.0;
const DIVE_IND_P2       = 0.7;
const DIVE_IND_P3       = 0.4;

const FEATHER_WINDUP    = 0.5;
const FEATHER_SPEED     = 220;
const FEATHER_DMG       = 12;
const FEATHER_DIRS_P12  = 8;
const FEATHER_DIRS_P3   = 16;

const SCREECH_WINDUP    = 0.4;
const SCREECH_RADIUS    = 220;
const SCREECH_STUN      = 0.6;
const SCREECH_DUR       = 0.6;

const WHIRL_RADIUS      = 240;
const WHIRL_DUR         = 2.0;
const WHIRL_PULL_ACCEL  = 120;

const PHASE2_HP_RATIO   = 0.6;
const PHASE3_HP_RATIO   = 0.3;
const PATTERN_CD_MIN    = 1.6;
const PATTERN_CD_MAX    = 2.4;
const PHASE3_CD_MULT    = 0.6;
const PHASE3_TINT       = 0xff6666;
const HIT_STUN_DUR      = 0.3;

const SUMMON_TYPE       = 'bat';
const SUMMON_COUNT_P3   = 4;

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

// 상태: idle | dive_windup | dive | dive_recover | feather_windup | screech_windup | screech | whirl | stun
export default class OwlKing {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 960;
    this.maxHp  = 960;
    this.speed  = BASE_SPEED;
    this.damage = DIVE_DMG;
    this.displayName = 'OWL KING';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 60;
    this.isBoss      = true;
    this.isFinalBoss = true;

    this._phase         = 1;
    this._patternCd     = 1.2;
    this._player        = null;

    this._diveDir       = { x: 0, y: 1 };
    this._diveTargetX   = 0;
    this._diveTargetY   = 0;
    this._diveTimer     = 0;
    this._diveIndGfx    = null;

    this._featherTimer  = 0;
    this._screechTimer  = 0;
    this._whirlTimer    = 0;
    this._whirlGfx      = null;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'owlking-s';

    this.gameObject = scene.add.image(x, y, 'owlking-s').setDisplaySize(OK_DW, OK_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.body.setMaxVelocity(500, 500);
    this.gameObject.setDepth(9);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this._player = player;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (this._phase < 2 && this.hp / this.maxHp <= PHASE2_HP_RATIO) this._enterPhase2();
    if (this._phase < 3 && this.hp / this.maxHp <= PHASE3_HP_RATIO) this._enterPhase3();

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this._hover(dx, dy, dist);
        this._patternCd -= dt;
        if (this._patternCd <= 0) this._startNextPattern(player);
        break;

      case 'dive_windup': {
        this.gameObject.body.setVelocity(0, 0);
        this._diveTimer -= dt;
        const indDur = this._diveIndDur();
        const progress = 1 - this._diveTimer / indDur;
        this._updateDiveIndicator(progress);
        if (this._diveTimer <= 0) this._startDive();
        break;
      }

      case 'dive':
        this._diveTimer -= dt;
        this.gameObject.body.setVelocity(this._diveDir.x * DIVE_SPEED, this._diveDir.y * DIVE_SPEED);
        // 강하 중 피해 판정 — 보스 body 와 플레이어 거리
        if (Math.abs(player.x - this.gameObject.x) < OK_DW / 2 + 22
            && Math.abs(player.y - this.gameObject.y) < OK_DH / 2 + 22
            && this.attackCooldown <= 0) {
          this.attackCooldown = 0.5;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const dead = player.takeDamage(DIVE_DMG, {
            dx: dx / len, dy: dy / len, force: DIVE_PUSH, duration: DIVE_PUSH_DUR,
          });
          if (dead) this.scene.events.emit('player-dead');
        }
        if (this._diveTimer <= 0) {
          this.gameObject.body.setVelocity(0, 0);
          this.state = 'dive_recover';
          this._diveTimer = DIVE_RECOVER;
        }
        break;

      case 'dive_recover':
        this.gameObject.body.setVelocity(0, 0);
        this._diveTimer -= dt;
        if (this._diveTimer <= 0) this._endPattern();
        break;

      case 'feather_windup':
        this.gameObject.body.setVelocity(0, 0);
        this._featherTimer -= dt;
        if (this._featherTimer <= 0) this._launchFeatherVolley();
        break;

      case 'screech_windup':
        this.gameObject.body.setVelocity(0, 0);
        this._screechTimer -= dt;
        if (this._screechTimer <= 0) this._triggerScreech(player, dist);
        break;

      case 'screech':
        this.gameObject.body.setVelocity(0, 0);
        this._screechTimer -= dt;
        if (this._screechTimer <= 0) this._endPattern();
        break;

      case 'whirl': {
        this._whirlTimer -= dt;
        // 호버 + 흡인장
        this._hover(dx, dy, dist);
        this._updateWhirlGfx();
        // 플레이어 흡인
        if (dist < WHIRL_RADIUS && dist > 1) {
          const pullVx = -dx / dist * WHIRL_PULL_ACCEL * dt;
          const pullVy = -dy / dist * WHIRL_PULL_ACCEL * dt;
          player.gameObject.body.setVelocity(
            player.gameObject.body.velocity.x + pullVx,
            player.gameObject.body.velocity.y + pullVy,
          );
        }
        if (this._whirlTimer <= 0) {
          if (this._whirlGfx?.active) { this._whirlGfx.destroy(); this._whirlGfx = null; }
          this._endPattern();
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
          if (this._phase === 3) this.gameObject.setTint(PHASE3_TINT);
          else this.gameObject.clearTint();
          this.state = this._prevState;
        }
        break;
    }

    this._updateSprite();
    this._syncHpBar();
  }

  takeDamage(amount, knockback = null) {
    if (!this.alive || this.state === 'stun') return false;
    // 강하 중 무적
    if (this.state === 'dive') return false;

    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) { this._die(); return true; }

    if (this.state === 'idle') {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration * 0.3;
        this._knockbackDuration = duration * 0.3;
        this._knockbackVx = dx * force * 0.3;
        this._knockbackVy = dy * force * 0.3;
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
    if (this._diveIndGfx?.active) this._diveIndGfx.destroy();
    if (this._whirlGfx?.active)   this._whirlGfx.destroy();
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.alive = false;
    if (this.gameObject?.active) this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _hover(dx, dy, dist) {
    // 거리 유지 호버 — 너무 가까우면 후퇴, 너무 멀면 접근
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    const PREFER = 160;
    if (dist < PREFER - 30) {
      this.gameObject.body.setVelocity(
        (-dx / dist) * this.speed * 0.5,
        (-dy / dist) * this.speed * 0.5,
      );
    } else if (dist > PREFER + 30) {
      this.gameObject.body.setVelocity(
        (dx / dist) * this.speed * 0.5,
        (dy / dist) * this.speed * 0.5,
      );
    } else {
      this.gameObject.body.setVelocity(0, 0);
    }
  }

  _diveIndDur() {
    if (this._phase === 3) return DIVE_IND_P3;
    if (this._phase === 2) return DIVE_IND_P2;
    return DIVE_IND_P1;
  }

  _startNextPattern(player) {
    // 패턴 풀: 페이즈별 분기
    let pool;
    if (this._phase === 1) {
      pool = ['shadow_dive', 'shadow_dive', 'shadow_dive', 'feather_volley', 'feather_volley', 'screech'];
    } else if (this._phase === 2) {
      pool = ['shadow_dive', 'shadow_dive', 'feather_volley', 'screech', 'whirlwind', 'whirlwind'];
    } else {
      pool = ['shadow_dive', 'shadow_dive', 'feather_volley', 'feather_volley', 'whirlwind', 'screech'];
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];

    switch (pick) {
      case 'shadow_dive':
        this._beginDiveWindup(player);
        break;
      case 'feather_volley':
        this.state = 'feather_windup';
        this._featherTimer = FEATHER_WINDUP;
        break;
      case 'screech':
        this.state = 'screech_windup';
        this._screechTimer = SCREECH_WINDUP;
        this.gameObject.setTint(0xffcc66);
        break;
      case 'whirlwind':
        this._startWhirl();
        break;
    }
  }

  _endPattern() {
    this.state = 'idle';
    if (this._phase === 3) this.gameObject.setTint(PHASE3_TINT);
    else this.gameObject.clearTint();
    const base = PATTERN_CD_MIN + Math.random() * (PATTERN_CD_MAX - PATTERN_CD_MIN);
    this._patternCd = this._phase === 3 ? base * PHASE3_CD_MULT
                    : this._phase === 2 ? base * 0.85
                    : base;
  }

  // ── 패턴: 그림자 강하 ─────────────────────────────────

  _beginDiveWindup(player) {
    this.state = 'dive_windup';
    this._diveTimer = this._diveIndDur();
    this._diveTargetX = player.x;
    this._diveTargetY = player.y;
    this._diveIndGfx = this.scene.add.graphics().setDepth(7);
  }

  _updateDiveIndicator(progress) {
    if (!this._diveIndGfx?.active) return;
    this._diveIndGfx.clear();
    const r = 38;
    this._diveIndGfx.fillStyle(0x000000, 0.35 + progress * 0.35);
    this._diveIndGfx.fillCircle(this._diveTargetX, this._diveTargetY, r);
    this._diveIndGfx.lineStyle(2.5, 0xff4422, 0.5 + progress * 0.5);
    this._diveIndGfx.strokeCircle(this._diveTargetX, this._diveTargetY, r);
  }

  _startDive() {
    if (this._diveIndGfx?.active) { this._diveIndGfx.destroy(); this._diveIndGfx = null; }
    const dx = this._diveTargetX - this.gameObject.x;
    const dy = this._diveTargetY - this.gameObject.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this._diveDir = { x: dx / len, y: dy / len };
    this._diveTimer = DIVE_DURATION;
    this.state = 'dive';
    const cd = calcDir(this._diveDir.x, this._diveDir.y);
    if (cd) this._lastDir = cd;
    this.attackCooldown = 0;
  }

  // ── 패턴: 깃털 산탄 ──────────────────────────────────

  _launchFeatherVolley() {
    const count = this._phase === 3 ? FEATHER_DIRS_P3 : FEATHER_DIRS_P12;
    const { x, y } = this.gameObject;
    const em = this.scene.enemyManager;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const vx = Math.cos(ang) * FEATHER_SPEED;
      const vy = Math.sin(ang) * FEATHER_SPEED;
      const proj = this.scene.add.image(x, y, 'owlking-feather')
        .setDisplaySize(16, 16)
        .setRotation(ang)
        .setDepth(8);
      em?.addEnemyProjectile(proj, FEATHER_DMG, vx, vy, '부엉이왕 깃털');
    }
    this._endPattern();
  }

  // ── 패턴: 비명 ────────────────────────────────────────

  _triggerScreech(player, dist) {
    this.state = 'screech';
    this._screechTimer = SCREECH_DUR;
    // 펄스 시각
    const { x, y } = this.gameObject;
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 120, () => {
        if (!this.alive) return;
        const gfx   = this.scene.add.graphics().setDepth(8);
        const state = { r: 30, a: 0.8 };
        this.scene.tweens.add({
          targets: state, r: SCREECH_RADIUS, a: 0, duration: 500, ease: 'Quad.Out',
          onUpdate: () => {
            gfx.clear();
            gfx.lineStyle(3, 0xffcc44, state.a);
            gfx.strokeCircle(this.gameObject.x, this.gameObject.y, state.r);
          },
          onComplete: () => gfx.destroy(),
        });
      });
    }
    this.scene.cameras.main.shake(180, 0.012);
    if (dist <= SCREECH_RADIUS) player.stun(SCREECH_STUN);
  }

  // ── 패턴: 회오리 ──────────────────────────────────────

  _startWhirl() {
    this.state = 'whirl';
    this._whirlTimer = WHIRL_DUR;
    this._whirlGfx = this.scene.add.graphics().setDepth(7);
    // 회오리 시작 시 깃털 4발 산개
    const { x, y } = this.gameObject;
    const em = this.scene.enemyManager;
    const baseAng = Math.random() * Math.PI * 2;
    for (let i = 0; i < 4; i++) {
      const ang = baseAng + (i / 4) * Math.PI * 2;
      const proj = this.scene.add.image(x, y, 'owlking-feather')
        .setDisplaySize(16, 16)
        .setRotation(ang)
        .setDepth(8);
      em?.addEnemyProjectile(proj, FEATHER_DMG, Math.cos(ang) * FEATHER_SPEED, Math.sin(ang) * FEATHER_SPEED, '부엉이왕 깃털');
    }
  }

  _updateWhirlGfx() {
    if (!this._whirlGfx?.active) return;
    const { x, y } = this.gameObject;
    const progress = 1 - this._whirlTimer / WHIRL_DUR;
    const alpha = 0.4 - Math.abs(progress - 0.5) * 0.3;
    this._whirlGfx.clear();
    this._whirlGfx.lineStyle(3, 0x88aaff, alpha);
    // 회전하는 동심원
    const spinR = WHIRL_RADIUS * (0.4 + Math.sin(progress * Math.PI * 4) * 0.1);
    this._whirlGfx.strokeCircle(x, y, spinR);
    this._whirlGfx.strokeCircle(x, y, spinR + 30);
    this._whirlGfx.strokeCircle(x, y, WHIRL_RADIUS);
  }

  // ── 페이즈 전환 ──────────────────────────────────────

  _enterPhase2() {
    this._phase = 2;
    this.scene.cameras.main.flash(400, 100, 150, 220, false);
  }

  _enterPhase3() {
    this._phase = 3;
    this.state = 'idle';
    this.gameObject.body.setVelocity(0, 0);
    if (this._diveIndGfx?.active) { this._diveIndGfx.destroy(); this._diveIndGfx = null; }
    if (this._whirlGfx?.active)   { this._whirlGfx.destroy(); this._whirlGfx = null; }
    this._patternCd = 1.0;
    this.gameObject.setTint(PHASE3_TINT);
    this._curKey = '';
    this.scene.cameras.main.flash(500, 255, 0, 0, false);
    this._summonBats();
  }

  _summonBats() {
    const em = this.scene.enemyManager;
    if (!em) return;
    const { x, y } = this.gameObject;
    const pad = WALL_T + 50;
    for (let i = 0; i < SUMMON_COUNT_P3; i++) {
      const angle = (i / SUMMON_COUNT_P3) * Math.PI * 2 + Math.random() * 0.4;
      const r     = 90 + Math.random() * 60;
      const sx    = Math.max(pad, Math.min(ROOM_W - pad, x + Math.cos(angle) * r));
      const sy    = Math.max(pad, Math.min(ROOM_H - pad, y + Math.sin(angle) * r));
      em.spawnEnemy(SUMMON_TYPE, sx, sy);
    }
  }

  // ── 스프라이트 ────────────────────────────────────────

  _updateSprite() {
    if (this.state === 'stun') return;
    const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    if (dir) this._lastDir = dir;
    const key = `owlking-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(OK_DW, OK_DH);
      this._applyBodySize();
    }
    if (this._phase === 3) this.gameObject.setTint(PHASE3_TINT);
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(OK_W / sx, OK_H / sy, true);
  }

  // ── HP 바 ─────────────────────────────────────────────

  _buildHpBar() {
    const { x, y } = this.gameObject;
    const barY = y - OK_DH / 2 - 12;
    this._hpBg   = this.scene.add.rectangle(x, barY, OK_DW, 6, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - OK_DW / 2, barY, OK_DW, 6, 0xffcc44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    const barY = y - OK_DH / 2 - 12;
    this._hpBg.setPosition(x, barY);
    this._hpFill.setPosition(x - OK_DW / 2, barY);
    this._hpFill.width = OK_DW * Math.max(0, this.hp / this.maxHp);
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
          if (this._phase === 3) this.gameObject.setTint(PHASE3_TINT);
          else this.gameObject.clearTint();
        }
      },
    });
  }

  _die() {
    this.alive = false;
    this.gameObject.body.setEnable(false);
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    if (this._diveIndGfx?.active) this._diveIndGfx.destroy();
    if (this._whirlGfx?.active) this._whirlGfx.destroy();
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();

    this.scene.cameras.main.flash(600, 255, 220, 80, false);
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
