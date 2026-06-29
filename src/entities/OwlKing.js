/**
 * 부엉이왕 (OwlKing) — 구역 2 최종 보스 (10층)
 * HP 800 / 크기 80×80px
 *
 * 인지 범위: 방 어디서든 즉시 추적·공격 (DETECT_R 없음)
 * 이동: 220px/s 비행 — 플레이어 주위 ~160px 링을 선회 비행 (접선 ×0.55, 1.6~3.8s마다 선회 방향 전환)
 * 페이즈:
 *   Phase 1 (HP 100~60%) — 공중 정찰: shadow_dive(50%) + feather_volley(33%) + screech(17%)
 *   Phase 2 (HP 60~30%)  — feather_rain·whirlwind 추가, dive 2연속, dive 인디케이터 1.0→0.7s 단축
 *   Phase 3 (HP <30%)    — 광폭화: 첫 진입 시 박쥐 4 소환, 쿨다운 ×0.6, dive 3연속·인디케이터 0.4s,
 *                          volley 16방향, rain 7발
 *
 * 패턴 (직전과 같은 패턴이면 1회 재추첨 — 연속 반복 완화):
 *   shadow_dive  → 지면 그림자 인디케이터 후 직선 강하 418px/s × 0.5s — 페이즈 수만큼 연속 강하
 *                  (2회차부터 예고 0.3s 재조준, 경직 없이 연쇄), 강하 중 무적, 데미지 18,
 *                  마지막 강하 후에만 0.4초 경직
 *   feather_volley → 0.5초 정지 후 깃털 2연파 — 1파 N방향(플레이어 정조준 기준),
 *                    0.4s 후 2파 재조준 + 반스텝(π/N) 회전으로 1파 틈새를 메움
 *                    Phase 1·2: 8방향 / Phase 3: 16방향 (각 220px/s, 데미지 12)
 *   feather_rain → (P2+) 0.4초 날갯짓 후 플레이어 주변 낙하 표식 5곳(P3 7곳, 첫 발 정조준, 90ms 간격 순차)
 *                  → 0.85s 후 깃털 낙하, 반경 34px 타격 14 — 보스 사망 시 미낙하분 중단
 *   screech      → 0.4초 예고 → 반경 220px AoE → 플레이어 0.6초 기절 (데미지 없음)
 *   whirlwind    → 반경 240px 흡인장(2.0초, 120px/s²) + 동시에 깃털 4발 산개 (선회 비행 유지)
 * 패턴 쿨다운: 1페 1.6~2.4s / 2페 ×0.85 / 3페 ×0.6
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
const DIVE_DMG          = 18;
const DIVE_PUSH         = 360;
const DIVE_PUSH_DUR     = 0.25;
const DIVE_IND_P1       = 1.0;
const DIVE_IND_P2       = 0.7;
const DIVE_IND_P3       = 0.4;
const DIVE_IND_CHAIN    = 0.3;  // 연속 강하 2회차부터 짧은 재조준 예고

const FEATHER_WINDUP    = 0.5;
const FEATHER_SPEED     = 220;
const FEATHER_DMG       = 12;
const FEATHER_DIRS_P12  = 8;
const FEATHER_DIRS_P3   = 16;
const FEATHER_WAVE_GAP  = 0.4;  // 깃털 1파 → 2파 간격 (2파는 반스텝 회전 + 재조준)

const RAIN_WINDUP       = 0.4;  // 깃털 낙하 — 날갯짓 예고
const RAIN_COUNT_P2     = 5;    // 낙하 표식 수 (Phase 2)
const RAIN_COUNT_P3     = 7;    // 낙하 표식 수 (Phase 3)
const RAIN_DELAY        = 0.85; // 표식 → 낙하까지
const RAIN_STAGGER_MS   = 90;   // 표식 순차 생성 간격 (낙하도 그만큼 순차)
const RAIN_RADIUS       = 34;   // 낙하 타격 반경
const RAIN_DMG          = 14;
const RAIN_SPREAD       = 130;  // 플레이어 주변 산포 반경 (첫 발은 정조준)

const ORBIT_MULT        = 0.55; // 선회 비행 접선 속도 배율 (speed 기준)

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
const SUMMON_COUNT_P3   = 18;

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

// 상태: idle | dive_windup | dive | dive_recover | feather_windup | feather_gap | rain_windup
//      | screech_windup | screech | whirl | stun
export default class OwlKing {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 800;
    this.maxHp  = 800;
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
    this._divesLeft     = 0;            // 남은 연속 강하 수 (패턴 시작 시 페이즈 수로 초기화)
    this._diveWindupTotal = DIVE_IND_P1; // 현재 예고 길이 (인디케이터 진행도 계산용)

    this._featherTimer  = 0;
    this._screechTimer  = 0;
    this._whirlTimer    = 0;
    this._whirlGfx      = null;
    this._rainTimer     = 0;
    this._rainGfx       = [];           // 낙하 표식 gfx (dispose 시 일괄 정리)

    this._lastPattern   = '';           // 직전 패턴 — 같은 패턴 연속 시 1회 재추첨
    this._orbitDir      = Math.random() < 0.5 ? 1 : -1; // 선회 방향 (±1)
    this._orbitFlipTimer = 2;           // 선회 방향 전환 타이머

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
        this._hover(dx, dy, dist, dt);
        this._patternCd -= dt;
        if (this._patternCd <= 0) this._startNextPattern(player);
        break;

      case 'dive_windup': {
        this.gameObject.body.setVelocity(0, 0);
        this._diveTimer -= dt;
        const progress = 1 - this._diveTimer / this._diveWindupTotal;
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
          this._divesLeft--;
          if (this._divesLeft > 0) {
            // 연속 강하: 경직 없이 플레이어 현재 위치로 짧게 재조준 후 즉시 재강하
            this._beginDiveWindup(player, DIVE_IND_CHAIN);
          } else {
            this.state = 'dive_recover';
            this._diveTimer = DIVE_RECOVER;
          }
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
        if (this._featherTimer <= 0) {
          this._launchFeatherWave(1);
          this.state = 'feather_gap';
          this._featherTimer = FEATHER_WAVE_GAP;
        }
        break;

      case 'feather_gap': // 1파 → 2파 사이 날갯짓 — 2파는 반스텝 회전 + 재조준
        this.gameObject.body.setVelocity(0, 0);
        this._featherTimer -= dt;
        if (this._featherTimer <= 0) {
          this._launchFeatherWave(2);
          this._endPattern();
        }
        break;

      case 'screech_windup':
        this.gameObject.body.setVelocity(0, 0);
        this._screechTimer -= dt;
        if (this._screechTimer <= 0) this._triggerScreech(player, dist);
        break;

      case 'rain_windup': // 깃털 낙하 — 날갯짓 후 표식 살포, 낙하는 비동기 진행
        this.gameObject.body.setVelocity(0, 0);
        this._rainTimer -= dt;
        if (this._rainTimer <= 0) {
          this._dropFeatherRain(player);
          this._endPattern();
        }
        break;

      case 'screech':
        this.gameObject.body.setVelocity(0, 0);
        this._screechTimer -= dt;
        if (this._screechTimer <= 0) this._endPattern();
        break;

      case 'whirl': {
        this._whirlTimer -= dt;
        // 선회 비행 + 흡인장
        this._hover(dx, dy, dist, dt);
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
    this._rainGfx.forEach(g => { if (g?.active) g.destroy(); });
    this._rainGfx = [];
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.alive = false;
    if (this.gameObject?.active) this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _hover(dx, dy, dist, dt) {
    // 선회 비행 — 플레이어 주위 ~160px 링을 맴돌며 (방사: 반경 유지 + 접선: 선회) 합성
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    this._orbitFlipTimer -= dt;
    if (this._orbitFlipTimer <= 0) {
      this._orbitDir *= -1;  // 가끔 선회 방향 전환 — 단조로운 원운동 방지
      this._orbitFlipTimer = 1.6 + Math.random() * 2.2;
    }
    const PREFER = 160;
    let radial = 0;
    if (dist < PREFER - 30)      radial = -0.5; // 너무 가까우면 후퇴
    else if (dist > PREFER + 30) radial =  0.5; // 너무 멀면 접근
    const nx = dx / dist, ny = dy / dist;
    const tx = -ny * this._orbitDir, ty = nx * this._orbitDir; // 접선 방향
    this.gameObject.body.setVelocity(
      (nx * radial + tx * ORBIT_MULT) * this.speed,
      (ny * radial + ty * ORBIT_MULT) * this.speed,
    );
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
      pool = ['shadow_dive', 'shadow_dive', 'feather_volley', 'feather_rain', 'feather_rain', 'whirlwind', 'screech'];
    } else {
      pool = ['shadow_dive', 'shadow_dive', 'feather_volley', 'feather_volley', 'feather_rain', 'feather_rain', 'whirlwind', 'screech'];
    }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick === this._lastPattern) pick = pool[Math.floor(Math.random() * pool.length)]; // 연속 반복 1회 재추첨
    this._lastPattern = pick;

    switch (pick) {
      case 'shadow_dive':
        this._divesLeft = this._phase; // P1 1회 / P2 2연속 / P3 3연속
        this._beginDiveWindup(player);
        break;
      case 'feather_volley':
        this.state = 'feather_windup';
        this._featherTimer = FEATHER_WINDUP;
        break;
      case 'feather_rain':
        this.state = 'rain_windup';
        this._rainTimer = RAIN_WINDUP;
        this.gameObject.setTint(0xaaccff);
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

  _beginDiveWindup(player, indDur = null) {
    this.state = 'dive_windup';
    this._diveWindupTotal = indDur ?? this._diveIndDur();
    this._diveTimer = this._diveWindupTotal;
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

  // ── 패턴: 깃털 산탄 (2연파) ──────────────────────────

  /** wave 1: 플레이어 정조준 기준 N방향 / wave 2: 재조준 + 반스텝(π/N) 회전 — 1파 틈새를 메운다 */
  _launchFeatherWave(wave) {
    const count = this._phase === 3 ? FEATHER_DIRS_P3 : FEATHER_DIRS_P12;
    const { x, y } = this.gameObject;
    const em = this.scene.enemyManager;
    const p  = this._player;
    const aim  = p ? Math.atan2(p.y - y, p.x - x) : 0;
    const base = aim + (wave === 2 ? Math.PI / count : 0);
    for (let i = 0; i < count; i++) {
      const ang = base + (i / count) * Math.PI * 2;
      const vx = Math.cos(ang) * FEATHER_SPEED;
      const vy = Math.sin(ang) * FEATHER_SPEED;
      const proj = this.scene.add.image(x, y, 'owlking-feather')
        .setDisplaySize(16, 16)
        .setRotation(ang)
        .setDepth(8);
      em?.addEnemyProjectile(proj, FEATHER_DMG, vx, vy, '부엉이왕 깃털');
    }
  }

  // ── 패턴: 깃털 낙하 ──────────────────────────────────

  /** 플레이어 주변에 낙하 표식을 순차 살포 — 첫 발은 정조준, 나머지는 RAIN_SPREAD 산포 */
  _dropFeatherRain(player) {
    const count = this._phase === 3 ? RAIN_COUNT_P3 : RAIN_COUNT_P2;
    const pad = WALL_T + 24;
    for (let i = 0; i < count; i++) {
      const tx = i === 0 ? player.x
        : Math.max(pad, Math.min(ROOM_W - pad, player.x + (Math.random() * 2 - 1) * RAIN_SPREAD));
      const ty = i === 0 ? player.y
        : Math.max(pad, Math.min(ROOM_H - pad, player.y + (Math.random() * 2 - 1) * RAIN_SPREAD));
      this._spawnRainStrike(tx, ty, i * RAIN_STAGGER_MS);
    }
  }

  _spawnRainStrike(tx, ty, delayMs) {
    this.scene.time.delayedCall(delayMs, () => {
      if (!this.alive) return;
      // 지면 표식 — RAIN_DELAY 동안 점점 짙어짐
      const gfx = this.scene.add.graphics().setDepth(7);
      this._rainGfx.push(gfx);
      const ind = { t: 0 };
      this.scene.tweens.add({
        targets: ind, t: 1, duration: RAIN_DELAY * 1000, ease: 'Linear',
        onUpdate: () => {
          if (!gfx.active) return;
          gfx.clear();
          gfx.fillStyle(0x000000, 0.25 + ind.t * 0.3);
          gfx.fillCircle(tx, ty, RAIN_RADIUS * (0.5 + ind.t * 0.5));
          gfx.lineStyle(2, 0xffcc44, 0.4 + ind.t * 0.6);
          gfx.strokeCircle(tx, ty, RAIN_RADIUS);
        },
        onComplete: () => {
          if (gfx.active) gfx.destroy();
          this._rainGfx = this._rainGfx.filter(g => g !== gfx);
          if (!this.alive) return; // 보스 사망 시 낙하 중단
          // 깃털 낙하 연출 — 착지 순간 피해 판정
          const feather = this.scene.add.image(tx, ty - 90, 'owlking-feather')
            .setDisplaySize(18, 18).setRotation(Math.PI / 2).setDepth(8);
          this.scene.tweens.add({
            targets: feather, y: ty, duration: 130, ease: 'Quad.In',
            onComplete: () => {
              this.scene.tweens.add({ targets: feather, alpha: 0, duration: 300, onComplete: () => feather.destroy() });
              // 임팩트 링
              const ring = this.scene.add.graphics().setDepth(8);
              const rs = { r: 8, a: 0.8 };
              this.scene.tweens.add({
                targets: rs, r: RAIN_RADIUS, a: 0, duration: 220, ease: 'Quad.Out',
                onUpdate: () => {
                  if (!ring.active) return;
                  ring.clear();
                  ring.lineStyle(2.5, 0xffcc44, rs.a);
                  ring.strokeCircle(tx, ty, rs.r);
                },
                onComplete: () => ring.destroy(),
              });
              const p = this._player;
              if (p && this.alive) {
                const ddx = p.x - tx, ddy = p.y - ty;
                if (ddx * ddx + ddy * ddy <= RAIN_RADIUS * RAIN_RADIUS) {
                  p.lastDamageSource = '부엉이왕 깃털 낙하';
                  const dead = p.takeDamage(RAIN_DMG);
                  if (dead) this.scene.events.emit('player-dead');
                }
              }
            },
          });
        },
      });
    });
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
    this._rainGfx.forEach(g => { if (g?.active) g.destroy(); });
    this._rainGfx = [];
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
