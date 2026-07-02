import Hound from './Hound.js';

/**
 * 사냥꾼 보스 ("수석 사냥꾼", HunterBoss) — 구역 3 표시 10층 / 구역 4 표시 10층 보스 (인간, 다페이즈)
 * HP 1500 / 속도 155 / 데미지: 화살 18 · 단검 접촉 22 · 연타 14×n / 코어 22
 *
 * 단검 사냥꾼 + 활 사냥꾼의 특징을 모두 담은 마스터 — 거리·페이즈 가중치로 행동을 즉석 선택해
 * 사격 ↔ 기습 대시 연타 ↔ 구르기 이탈을 자유롭게 섞는다(고정 타이머가 아니라 _chooseAction 결정).
 *
 * 행동 (활/단검 공용 메뉴, 가중치만 페이즈로 변동):
 *   aim    → 0.6초 조준선 표시 → 화살 1발 (분노 0.42초)
 *   fan    → 조준 → 부채꼴 5발 (P3 전용)
 *   snare  → 플레이어 위치로 올가미 덫 투척(포물선 호+회전, _throwSnare) → 착지 시 발동
 *            (Player.applyRoot, 속박 여부 무관 근접 공격 반경 내 5타로 끊김 — 잔여 타격 수 세그먼트 바는
 *            최초 1회 피격 전까지 숨겨져 있다가 첫 타격 시 생성)
 *   combo  → dashWind(0.26초 예고) → dash(470px/s 기습) → slash(전진 연타, 수동 판정 14×3, 분노 4)
 *            → roll(460px/s 구르기 이탈)
 *
 * 페이즈 (HP 비율) — 강조점만 이동:
 *   P1 (100~60%): 원거리 우세(aim·snare), 플레이어가 붙으면 가끔 combo 후 roll 이탈
 *   P2 (60~30%) : 근접 우세(combo·snare 연계) + 진입 시 사냥개 2마리 소환(1회)
 *   P3 (<30%)   : 분노(속도 ×1.2) — fan·combo 빈발, 모든 행동 쿨다운 단축
 *
 * 상태: idle | neutral | aim | dashWind | dash | slash | roll | stun
 * 화살: addEnemyProjectile(직선). 올가미: hazard 패턴(Player.applyRoot), 사망 후 잔존(_lingeringHazards).
 * 처치 처리: 방 타입('boss') + isBoss → EnemyManager 코어/레어 드롭. 구역 4(40층)은 런 종료(GameScene).
 */
const DETECT_R     = 999;   // 보스방은 항상 교전
const PREFER_DIST  = 230;   // 원거리 선호 거리
const MELEE_DIST   = 150;   // P2 근접 선호 거리
// 활
const AIM_DUR      = 0.6;
const AIM_DUR_RAGE = 0.42;
const ARROW_SPEED  = 560;
const ARROW_DMG    = 18;
const ARROW_SIZE   = 18;
const FAN_ANGLES   = [-20, -10, 0, 10, 20];
// 단검
const MOVE_SPEED   = 155;
const DASH_RANGE   = 330;   // combo 발동 가능 최대 거리
const DASH_SPEED   = 470;
const DASH_DUR     = 0.34;
const WINDUP_DUR   = 0.26;
const SLASH_RANGE  = 70;
const SLASH_REACH  = 86;
const SLASH_SPEED  = 330;
const SLASH_DMG    = 14;
const SLASH_DUR    = 0.13;
const COMBO_HITS      = 3;
const COMBO_HITS_RAGE = 4;
const DAGGER_DMG   = 22;    // 접촉 데미지
// 구르기
const ROLL_SPEED   = 460;
const ROLL_DUR     = 0.26;
// 올가미
const SNARE_R      = 42;
const SNARE_IMG    = 84;
const SNARE_DUR    = 6.0;
const SNARE_MAX    = 2;
const ROOT_DUR     = 1.0;
const SNARE_BREAK_HITS = 5;
const SNARE_BAR_SEG_W  = 10;   // 덫 잔여 타격 표시 세그먼트 폭
const SNARE_BAR_SEG_H  = 5;
const SNARE_BAR_GAP    = 2;
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

// 상태: idle | neutral | aim | dashWind | dash | slash | roll | stun
export default class HunterBoss {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 1500;
    this.maxHp  = 1500;
    this.speed  = MOVE_SPEED;
    this.damage = DAGGER_DMG;   // 접촉 데미지(단검)
    this.displayName = '수석 사냥꾼';
    this.isBoss = true;

    this.state      = 'idle';
    this._prevState = 'neutral';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 22;
    this.speedMult = 1.0;

    this._actionCd  = 0.8;
    this._aimTimer  = 0;
    this._aimFan    = false;
    this._stateTimer = 0;
    this._summoned  = false;
    this._snares    = [];
    this._aimGfx    = null;
    this._player    = null;

    this._faceX = 0;
    this._faceY = 1;
    this._dashVx = 0;
    this._dashVy = 0;
    this._rollVx = 0;
    this._rollVy = 0;
    this._slashDone  = false;
    this._slashIndex = 0;
    this._strafeSign = Math.random() < 0.5 ? 1 : -1;

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
    const rage    = phase === 3;
    const rageSpd = rage ? 1.2 : 1;

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.state = 'neutral';
        break;

      case 'neutral': {
        this._neutralMove(dx, dy, dist, phase, rageSpd);
        this._actionCd -= dt;
        if (this._actionCd <= 0) this._startAction(dx, dy, dist, phase);
        break;
      }

      case 'aim':
        this.gameObject.body.setVelocity(0, 0);
        this._drawAimLine(player);
        this._aimTimer -= dt;
        if (this._aimTimer <= 0) {
          this._clearAimLine();
          if (this._aimFan) FAN_ANGLES.forEach(a => this._fireArrow(dx, dy, a));
          else this._fireArrow(dx, dy, 0);
          this._actionCd = this._phaseCd(phase);
          this.state = 'neutral';
          this._strafeSign = Math.random() < 0.5 ? 1 : -1;
        }
        break;

      case 'dashWind': {
        this.gameObject.body.setVelocity(0, 0);
        // 예고 동안 조준을 천천히 추적 → 막판 고정
        if (dist > 0) {
          const tx = dx / dist, ty = dy / dist;
          this._faceX += (tx - this._faceX) * Math.min(1, 4 * dt);
          this._faceY += (ty - this._faceY) * Math.min(1, 4 * dt);
        }
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          const m = Math.hypot(this._faceX, this._faceY) || 1;
          const spd = DASH_SPEED * this.speedMult * rageSpd;
          this._dashVx = (this._faceX / m) * spd;
          this._dashVy = (this._faceY / m) * spd;
          this.state = 'dash';
          this._stateTimer = DASH_DUR;
        }
        break;
      }

      case 'dash':
        this.gameObject.body.setVelocity(this._dashVx, this._dashVy);
        this._stateTimer -= dt;
        if (dist <= SLASH_RANGE || this._stateTimer <= 0) {
          this.state = 'slash';
          this._stateTimer = SLASH_DUR;
          this._slashDone  = false;
          this._slashIndex = 0;
          if (dist > 0) { this._faceX = dx / dist; this._faceY = dy / dist; }
        }
        break;

      case 'slash':
        // 전진 비집기 + 슬래시마다 수동 판정 (전역 접촉은 억제해 중복 방지)
        this.gameObject.body.setVelocity(this._faceX * SLASH_SPEED, this._faceY * SLASH_SPEED);
        this.attackCooldown = 1;
        if (!this._slashDone) {
          this._slashDone = true;
          this._doSlash(player, dx, dy, dist);
        }
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this._slashIndex++;
          const maxHits = rage ? COMBO_HITS_RAGE : COMBO_HITS;
          if (this._slashIndex < maxHits && dist <= SLASH_REACH + 26) {
            if (dist > 0) { this._faceX = dx / dist; this._faceY = dy / dist; }
            this._stateTimer = SLASH_DUR;
            this._slashDone = false;
          } else {
            this._startRoll(dx, dy, dist);   // 연타 후 굴러서 이탈
          }
        }
        break;

      case 'roll':
        this.gameObject.body.setVelocity(this._rollVx, this._rollVy);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.gameObject.body.setVelocity(0, 0);
          this._actionCd = this._phaseCd(phase) * 0.6;
          this.state = 'neutral';
        }
        break;

      case 'stun':
        this.stunTimer -= dt;
        this.gameObject.body.setVelocity(0, 0);   // 보스 무게감 — 넉백 없이 정지
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

  takeDamage(amount, knockback = null, opts = {}) {
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    // 대시·연타·구르기 중엔 경직 면역(커밋·민첩). 사격/예고/중립은 끊을 수 있음.
    if (this.state !== 'dash' && this.state !== 'slash' && this.state !== 'roll' && !opts.noStagger) {
      this._prevState = (this.state === 'aim' || this.state === 'dashWind') ? 'neutral' : this.state;
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
    this._snares.forEach(s => {
      if (s.gfx?.active) { this.scene.tweens.killTweensOf(s.gfx); s.gfx.destroy(); }
      this._destroySnareBar(s);
    });
    this._snares = [];
    this.scene.events.off('attack-fired', this._onPlayerAttack, this);
    this.scene.enemyManager?.unregisterLingeringHazard?.(this);
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _phaseCd(phase) {
    const base = phase === 3 ? 0.6 : phase === 2 ? 0.85 : 1.1;
    return base * (0.7 + Math.random() * 0.6);
  }

  /** 중립 이동 — 선호 거리를 유지하며 측면으로 흔든다(직선 대치 회피). */
  _neutralMove(dx, dy, dist, phase, rageSpd) {
    const len = dist > 0 ? dist : 1;
    const spd = MOVE_SPEED * this.speedMult * rageSpd;
    const target = phase === 2 ? MELEE_DIST : PREFER_DIST;
    let vx, vy;
    if (dist < target - 40) { vx = -dx / len; vy = -dy / len; }
    else if (dist > target + 40) { vx = dx / len; vy = dy / len; }
    else { vx = (-dy / len) * this._strafeSign; vy = (dx / len) * this._strafeSign; }
    this.gameObject.body.setVelocity(vx * spd, vy * spd);
  }

  /** 거리·페이즈 가중치로 다음 행동을 선택해 진입 — 활/단검을 즉석에서 섞는다. */
  _startAction(dx, dy, dist, phase) {
    const canCombo = dist <= DASH_RANGE;
    let w;
    if (phase === 1)      w = { aim: 0.55, snare: 0.20, combo: canCombo ? 0.25 : 0 };
    else if (phase === 2) w = { combo: canCombo ? 0.50 : 0, snare: 0.20, aim: 0.30 };
    else                  w = { fan: 0.40, combo: canCombo ? 0.35 : 0, snare: 0.10, aim: 0.15 };
    const act = this._weightedPick(w);

    switch (act) {
      case 'aim':
      case 'fan':
        this._aimFan = (act === 'fan');
        this._aimTimer = phase === 3 ? AIM_DUR_RAGE : AIM_DUR;
        this.gameObject.body.setVelocity(0, 0);
        this.state = 'aim';
        break;
      case 'snare':
        this._placeSnare(this._player.x, this._player.y);
        this._actionCd = this._phaseCd(phase) * 0.7;
        break;
      case 'combo':
        if (dist > 0) { this._faceX = dx / dist; this._faceY = dy / dist; }
        this.gameObject.body.setVelocity(0, 0);
        this.state = 'dashWind';
        this._stateTimer = WINDUP_DUR;
        break;
      default:
        this._actionCd = 0.3;   // 폴백 — 잠시 후 재시도
    }
  }

  _weightedPick(weights) {
    let total = 0;
    for (const k in weights) total += weights[k];
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
    return null;
  }

  _startRoll(dx, dy, dist) {
    const len = dist > 0 ? dist : 1;
    // 플레이어 반대 방향 + 약간의 측면 성분으로 굴러 이탈
    let rx = -dx / len + (-dy / len) * this._strafeSign * 0.5;
    let ry = -dy / len + (dx / len) * this._strafeSign * 0.5;
    const m = Math.hypot(rx, ry) || 1;
    const spd = ROLL_SPEED * this.speedMult;
    this._rollVx = (rx / m) * spd;
    this._rollVy = (ry / m) * spd;
    this.state = 'roll';
    this._stateTimer = ROLL_DUR;
    this._strafeSign = Math.random() < 0.5 ? 1 : -1;
  }

  /** 'hound' 는 일반 스폰 테이블(ENEMY_CLASSES)에 없어 spawnEnemy('hound', …) 로 넘기면 Fox 로
   *  폴백되던 버그가 있었다 — 직접 Hound 를 생성해 addSummonedUnit 으로 등록한다. */
  _summonHounds() {
    const em = this.scene.enemyManager;
    if (!em?.addSummonedUnit) return;
    const bx = this.gameObject.x, by = this.gameObject.y;
    [-60, 60].forEach(off => {
      em.addSummonedUnit(new Hound(this.scene, bx + off, by + 40), 420);
    });
  }

  /** 정면 단검 베기 — 반경 SLASH_REACH 내 + 전방 반원(dot > 0)일 때만 명중 */
  _doSlash(player, dx, dy, dist) {
    if (dist > SLASH_REACH) return;
    const len = dist > 0 ? dist : 1;
    const dot = (dx / len) * this._faceX + (dy / len) * this._faceY;
    if (dot <= 0) return;
    player.lastDamageSource = '수석 사냥꾼' + (this.isElite ? ' (정예)' : '');
    const dead = player.takeDamage(SLASH_DMG, {
      dx: dx / len, dy: dy / len, force: 90, duration: 0.1,
    });
    if (dead) this.scene.events.emit('player-dead');
  }

  _fireArrow(dx, dy, angleOffsetDeg) {
    const base = Math.atan2(dy, dx) + (angleOffsetDeg * Math.PI / 180);
    const nx = Math.cos(base), ny = Math.sin(base);
    const proj = this.scene.add.image(this.gameObject.x, this.gameObject.y, 'hunter-arrow')
      .setDisplaySize(ARROW_SIZE, ARROW_SIZE / 2)
      .setRotation(base)
      .setDepth(8);
    this.scene.enemyManager.addEnemyProjectile(proj, ARROW_DMG, nx * ARROW_SPEED, ny * ARROW_SPEED, '사냥꾼 화살', this.isElite);
  }

  _drawAimLine(player) {
    if (!this._aimGfx) this._aimGfx = this.scene.add.graphics().setDepth(7);
    this._aimGfx.clear();
    this._aimGfx.lineStyle(1, 0xff5544, 0.7);
    if (this._aimFan) {
      const ang = Math.atan2(player.y - this.gameObject.y, player.x - this.gameObject.x);
      FAN_ANGLES.forEach(a => {
        const r = ang + a * Math.PI / 180;
        this._aimGfx.lineBetween(this.gameObject.x, this.gameObject.y,
          this.gameObject.x + Math.cos(r) * 400, this.gameObject.y + Math.sin(r) * 400);
      });
    } else {
      this._aimGfx.lineBetween(this.gameObject.x, this.gameObject.y, player.x, player.y);
    }
  }

  _clearAimLine() {
    if (this._aimGfx) { this._aimGfx.destroy(); this._aimGfx = null; }
  }

  _placeSnare(x, y) {
    // 사냥꾼 위치에서 목표 지점으로 던지는 모션 — 비행 중(flying)에는 함정 미발동
    const sx = this.gameObject.x, sy = this.gameObject.y;
    const gfx = this.scene.add.image(sx, sy, 'snare').setDisplaySize(SNARE_IMG, SNARE_IMG).setDepth(8);
    const snare = { gfx, timer: SNARE_DUR, x, y, struggle: 0, flying: true };
    this._snares.push(snare);
    while (this._snares.length > SNARE_MAX) {
      const old = this._snares.shift();
      if (old.gfx?.active) { this.scene.tweens.killTweensOf(old.gfx); old.gfx.destroy(); }
      this._destroySnareBar(old);
    }
    this._throwSnare(snare, sx, sy, x, y);
  }

  /** 잔여 타격 횟수 세그먼트 바 생성 — 착지(비행 종료) 시점에 호출 */
  _buildSnareBar(s) {
    s.barBg = [];
    s.barFill = [];
    for (let i = 0; i < SNARE_BREAK_HITS; i++) {
      s.barBg.push(this.scene.add.rectangle(0, 0, SNARE_BAR_SEG_W, SNARE_BAR_SEG_H, 0x000000, 0.4).setDepth(9));
      s.barFill.push(this.scene.add.rectangle(0, 0, SNARE_BAR_SEG_W, SNARE_BAR_SEG_H, 0xffcc33).setDepth(10));
    }
    this._syncSnareBar(s);
  }

  /** 세그먼트 위치/표시 갱신 — 남은 타격 수만큼 채워진 세그먼트 표시 */
  _syncSnareBar(s) {
    if (!s.barBg) return;
    const remaining = SNARE_BREAK_HITS - s.struggle;
    const totalW = SNARE_BREAK_HITS * SNARE_BAR_SEG_W + (SNARE_BREAK_HITS - 1) * SNARE_BAR_GAP;
    const startX = s.x - totalW / 2 + SNARE_BAR_SEG_W / 2;
    const barY   = s.y - SNARE_IMG / 2 - 12;
    for (let i = 0; i < SNARE_BREAK_HITS; i++) {
      const segX = startX + i * (SNARE_BAR_SEG_W + SNARE_BAR_GAP);
      s.barBg[i].setPosition(segX, barY);
      s.barFill[i].setPosition(segX, barY);
      s.barFill[i].setVisible(i < remaining);
    }
  }

  _destroySnareBar(s) {
    s.barBg?.forEach(r => r.active && r.destroy());
    s.barFill?.forEach(r => r.active && r.destroy());
    s.barBg = null;
    s.barFill = null;
  }

  /** 덫 던지기 — 포물선 호(떠올랐다 착지) + 회전으로 날아가 착지 시 함정 발동 */
  _throwSnare(snare, sx, sy, tx, ty) {
    const gfx  = snare.gfx;
    const dist = Math.hypot(tx - sx, ty - sy);
    const dur  = Math.min(520, 200 + dist * 0.7);
    const hop  = Math.min(40, 16 + dist * 0.06);
    this.scene.tweens.add({
      targets: gfx,
      x: tx, y: ty,
      angle: 540,
      duration: dur,
      ease: 'Sine.Out',
      onUpdate: (tw) => { gfx.y -= Math.sin(tw.progress * Math.PI) * hop; },  // 떠오르는 호
      onComplete: () => {
        if (!gfx.active) return;
        snare.flying = false;
        gfx.setAngle(0).setPosition(tx, ty).setDepth(7);
      },
    });
  }

  _tickSnares(dt, player) {
    this._snares = this._snares.filter(s => {
      if (s.flying) return true;   // 비행 중 — 착지 전이라 속박·페이드·만료 미적용
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.gfx?.active) s.gfx.destroy();
        this._destroySnareBar(s);
        return false;
      }
      if (s.gfx?.active) s.gfx.setAlpha(s.timer < 0.8 ? s.timer / 0.8 : 1);
      this._syncSnareBar(s);
      const dx = player.x - s.x;
      const dy = player.y - s.y;
      if (dx * dx + dy * dy < SNARE_R * SNARE_R) player.applyRoot?.(ROOT_DUR);
      return true;
    });
  }

  /** 근거리 공격(attack-fired): 덫이 공격 반경 안에 있으면(속박 여부 무관) 끊기 진행 — 5회째에 덫 제거 + 속박 즉시 해제. */
  _onPlayerAttack({ playerX, playerY, tierData }) {
    const radius = tierData?.radius ?? SNARE_R;
    this._snares = this._snares.filter(s => {
      if (s.flying) return true;   // 비행 중 덫은 끊을 수 없음
      const dx = playerX - s.x;
      const dy = playerY - s.y;
      if (dx * dx + dy * dy >= radius * radius) return true;
      if (++s.struggle < SNARE_BREAK_HITS) {
        if (!s.barBg) this._buildSnareBar(s); else this._syncSnareBar(s);
        return true;
      }
      if (s.gfx?.active) s.gfx.destroy();
      this._destroySnareBar(s);
      this._player?.clearRoot?.();
      return false;
    });
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 방향이 고정된 상태(대시·연타)는 face 벡터로, 그 외엔 이동 방향으로 스프라이트를 잡는다.
    let dir;
    if (this.state === 'dashWind' || this.state === 'dash' || this.state === 'slash') {
      dir = calcDir(this._faceX, this._faceY);
    } else {
      dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    }
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
