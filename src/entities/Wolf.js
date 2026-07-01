/**
 * 늑대 (Wolf) — 엘리트형 중간 보스
 * HP 240 / 속도 176 / 데미지 12(접촉) / 코어 드롭 12
 * 크기 32×36px
 *
 * 패턴 (무리 사냥형):
 *   idle   → chase (320px 이내 탐지)
 *   chase  → 직진 추격 (176px/s) — 200px 이내 접근 시 strafe 전환
 *            8초 뒤 첫 포효, 이후 20초마다 반복 (chase/strafe 중 타이머 진행)
 *   strafe → 플레이어 주위 ~140px 링 측면 우회 (150px/s, 개체별 선회 방향 랜덤 — 2마리가 자연 포위,
 *            벽에 막히면 방향 반전). 260px 이상 벌어지면 chase 복귀
 *   lunge  → 우회 중 쿨다운(3.2s ±15%)마다: 웅크림 0.3초(조준 고정 — 옆으로 피하면 빗나감)
 *            → 430px/s × 0.38s 도약(사거리 ≈163px, 도약 중 슈퍼아머: 피해만 받고 경직 무시)
 *            → 착지 경직 0.35초(응징 창) → 50% 확률 선회 방향 반전 후 복귀
 *   howl   → 1.5초 포효: 완전 정지 + 경직 취약
 *            종료 시 족제비(weasel) 2마리 소환 + 3초 광분 (추격·우회 속도 ×1.25, 주황 틴트)
 *   stun   → 피격 경직 0.3초 + 넉백 (이 시간 동안 추가 피격 무시 = i-frame)
 *
 * 오라 (생존 중 상시):
 *   180px 이내 아군 speedMult ×1.2
 *   사망 시 영향받은 적 speedMult 복원
 */
import { ROOM_W, ROOM_H, WALL_T } from '../world/Room';

const WOLF_W        = 32;   // 물리 body 크기 (canvas 32×32 정사각형 반영)
const WOLF_H        = 32;
const WOLF_DW       = 56;   // 표시 크기 (canvas 32:32 정사각형 유지)
const WOLF_DH       = 56;
const DETECT_R      = 320;
const CHASE_SPEED   = 176;
const HOWL_INIT_CD  = 8;
const HOWL_CD       = 20;
const HOWL_DUR      = 1.5;
const AURA_R        = 180;
const AURA_MULT     = 1.2;
const SUMMON_COUNT  = 2;
const SUMMON_TYPE   = 'weasel'; // howl 소환 적 타입 — 항상 족제비

const STRAFE_ENTER_R = 200;  // 이내로 접근하면 측면 우회 시작
const STRAFE_EXIT_R  = 260;  // 이상 벌어지면 직진 추격 복귀
const STRAFE_RING    = 140;  // 우회 선호 반경 (플레이어 기준 링)
const STRAFE_SPEED   = 150;  // 우회 이동 속도 (px/s)
const LUNGE_CD       = 3.2;  // 도약 쿨다운 (개체별 ±15% 분산)
const LUNGE_WINDUP   = 0.3;  // 웅크림 예고 — 시작 시 조준 고정, 옆으로 피하면 빗나감
const LUNGE_SPEED    = 430;  // 도약 속도 (px/s)
const LUNGE_DUR      = 0.38; // 도약 시간 — 사거리 ≈163px 고정
const LUNGE_RECOVER  = 0.35; // 도약 후 경직 (응징 창)
const FRENZY_DUR     = 3.0;  // 포효 후 광분 지속
const FRENZY_MULT    = 1.25; // 광분 중 추격·우회 속도 배율

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

// 상태: idle | chase | strafe | lunge_windup | lunge | lunge_recover | howl | stun
export default class Wolf {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp        = 240;
    this.maxHp     = 240;
    this.speed     = CHASE_SPEED;
    this.damage    = 12;
    this.speedMult = 1.0;
    this.displayName = '늑대';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 12;

    this._howlTimer   = HOWL_INIT_CD;
    this._howlDur     = 0;
    this._auraTargets = new Set();
    this._howlGfx     = null;

    this._orbitDir    = Math.random() < 0.5 ? 1 : -1;  // 우회 방향 — 2마리가 자연 포위하도록 개체별 랜덤
    this._lungeCd     = 1.2 + Math.random() * 1.2;     // 첫 도약 분산 (2마리 동시 도약 방지)
    this._lungeDir    = { x: 0, y: 1 };
    this._lungeTimer  = 0;
    this._frenzyTimer = 0;                             // 포효 후 광분 잔여 시간

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'wolf-s';

    this.gameObject = scene.add.image(x, y, 'wolf-s').setDisplaySize(WOLF_DW, WOLF_DH);
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
    this._lungeCd = Math.max(0, this._lungeCd - dt);
    if (this._frenzyTimer > 0) {
      this._frenzyTimer -= dt;
      if (this._frenzyTimer <= 0 && this.state !== 'stun') this.gameObject.clearTint();
    }

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'chase';
        break;

      case 'chase': {
        if (dist >= DETECT_R) { this.state = 'idle'; this.gameObject.body.setVelocity(0, 0); break; }
        if (dist <= STRAFE_ENTER_R) { this.state = 'strafe'; break; }
        const len = dist > 0 ? dist : 1;
        const spd = this.speed * this.speedMult * this._frenzyMult();
        this.gameObject.body.setVelocity((dx / len) * spd, (dy / len) * spd);
        this._howlTimer -= dt;
        if (this._howlTimer <= 0) this._startHowl();
        break;
      }

      case 'strafe': { // 측면 우회 — 플레이어 주위 링을 돌며 도약 타이밍을 잰다
        if (dist > STRAFE_EXIT_R) { this.state = 'chase'; break; }
        this._strafe(dx, dy, dist);
        this._howlTimer -= dt;
        if (this._howlTimer <= 0) { this._startHowl(); break; }
        if (this._lungeCd <= 0) this._startLungeWindup(dx, dy, dist);
        break;
      }

      case 'lunge_windup': // 웅크림 — 조준은 이미 고정, 옆으로 피하면 빗나감
        this.gameObject.body.setVelocity(0, 0);
        this._lungeTimer -= dt;
        if (this._lungeTimer <= 0) {
          this.state = 'lunge';
          this._lungeTimer = LUNGE_DUR;
        }
        break;

      case 'lunge':
        this._lungeTimer -= dt;
        this.gameObject.body.setVelocity(this._lungeDir.x * LUNGE_SPEED, this._lungeDir.y * LUNGE_SPEED);
        if (this._lungeTimer <= 0 || !this.gameObject.body.blocked.none) {
          this.gameObject.body.setVelocity(0, 0);
          this.state = 'lunge_recover';
          this._lungeTimer = LUNGE_RECOVER;
        }
        break;

      case 'lunge_recover': // 착지 경직 — 응징 창
        this.gameObject.body.setVelocity(0, 0);
        this._lungeTimer -= dt;
        if (this._lungeTimer <= 0) {
          this._lungeCd = LUNGE_CD * (0.85 + Math.random() * 0.3);
          if (Math.random() < 0.5) this._orbitDir *= -1; // 다음 우회 방향 변주
          this.state = dist <= STRAFE_EXIT_R ? 'strafe' : 'chase';
        }
        break;

      case 'howl':
        this._howlDur -= dt;
        this.gameObject.body.setVelocity(0, 0);
        if (this._howlDur <= 0) this._finishHowl();
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

    this._updateAura();
    this._updateSprite();
    this._syncHpBar();
  }

  takeDamage(amount, knockback = null, opts = {}) {
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (this.state === 'lunge') { this._blinkHit(); return false; } // 도약 중 슈퍼아머 — 피해만 적용
    if (!opts.noStagger) {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = this.state;
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
    if (this._blinkEvent)    { this._blinkEvent.remove(); this._blinkEvent = null; }
    if (this._howlGfx?.active) this._howlGfx.destroy();
    if (this._hpBg?.active)  this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this._restoreAura();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _frenzyMult() { return this._frenzyTimer > 0 ? FRENZY_MULT : 1; }

  /** 측면 우회 — 링 반경 유지(방사) + 선회(접선) 합성. 벽에 막히면 선회 방향 반전 */
  _strafe(dx, dy, dist) {
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    if (!this.gameObject.body.blocked.none) this._orbitDir *= -1;
    const nx = dx / dist, ny = dy / dist;
    let radial = 0;
    if (dist < STRAFE_RING - 25)      radial = -0.6; // 너무 가까우면 벌리고
    else if (dist > STRAFE_RING + 25) radial =  0.6; // 멀면 좁힌다
    const tx = -ny * this._orbitDir, ty = nx * this._orbitDir;
    const spd = STRAFE_SPEED * this.speedMult * this._frenzyMult();
    this.gameObject.body.setVelocity((nx * radial + tx * 0.85) * spd, (ny * radial + ty * 0.85) * spd);
  }

  _startLungeWindup(dx, dy, dist) {
    const len = dist > 0 ? dist : 1;
    this._lungeDir = { x: dx / len, y: dy / len }; // 웅크림 시작 시 조준 고정
    this.state = 'lunge_windup';
    this._lungeTimer = LUNGE_WINDUP;
    this.gameObject.body.setVelocity(0, 0);
    const cd = calcDir(this._lungeDir.x, this._lungeDir.y);
    if (cd) this._lastDir = cd;
  }

  _startHowl() {
    this.state    = 'howl';
    this._howlDur = HOWL_DUR;
    this._playHowlEffect();
  }

  _finishHowl() {
    this._howlTimer = HOWL_CD;
    this._frenzyTimer = FRENZY_DUR; // 포효 직후 광분 — 추격·우회 가속
    this.gameObject.setTint(0xffccaa);
    this.state = 'chase';
    this._summonMinions();
  }

  _summonMinions() {
    const em  = this.scene.enemyManager;
    const { x, y } = this.gameObject;
    const pad = WALL_T + 40;
    for (let i = 0; i < SUMMON_COUNT; i++) {
      const angle = (i / SUMMON_COUNT) * Math.PI * 2 + Math.random() * 0.8;
      const r     = 70 + Math.random() * 80;
      const sx    = Math.max(pad, Math.min(ROOM_W - pad, x + Math.cos(angle) * r));
      const sy    = Math.max(pad, Math.min(ROOM_H - pad, y + Math.sin(angle) * r));
      em.spawnEnemy(SUMMON_TYPE, sx, sy);
    }
  }

  _updateAura() {
    const enemies    = this.scene.enemyManager?.enemies ?? [];
    const newTargets = new Set();
    for (const e of enemies) {
      if (e === this || !e.alive) continue;
      const ex = e.x - this.gameObject.x;
      const ey = e.y - this.gameObject.y;
      if (ex * ex + ey * ey <= AURA_R * AURA_R) {
        // baseSpeedMult(구역 2/11층+ 강화 시 1.1, 평소 1.0) 기준으로 곱한다.
        e.speedMult = (e.baseSpeedMult ?? 1.0) * AURA_MULT;
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

  _playHowlEffect() {
    if (this._howlGfx?.active) this._howlGfx.destroy();
    const gfx = this.scene.add.graphics().setDepth(10);
    gfx.setPosition(this.gameObject.x, this.gameObject.y);
    gfx.lineStyle(3, 0xaabbaa, 0.9);
    gfx.strokeCircle(0, 0, 12);
    this._howlGfx = gfx;
    this.scene.tweens.add({
      targets: gfx,
      scaleX: AURA_R / 12, scaleY: AURA_R / 12,
      alpha: 0,
      duration: 900, ease: 'Quad.Out',
      onComplete: () => { if (gfx.active) gfx.destroy(); this._howlGfx = null; },
    });
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    let key;
    if (this.state === 'howl') {
      key = 'wolf-howl';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `wolf-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(WOLF_DW, WOLF_DH);
      this._applyBodySize();
    }
  }

  // body.setSize 는 source 픽셀이라 setDisplaySize 로 확대된 작은 텍스처 위에선 body 가 부풀려진다.
  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(WOLF_W / sx, WOLF_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 33, WOLF_DW + 4, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - (WOLF_DW + 4) / 2, y - 33, WOLF_DW + 4, 4, 0xdd6633)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 33);
    this._hpFill.setPosition(x - (WOLF_DW + 4) / 2, y - 33);
    this._hpFill.width = (WOLF_DW + 4) * Math.max(0, this.hp / this.maxHp);
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
    this._restoreAura();
    this.gameObject.body.setEnable(false);
    if (this._blinkEvent)    { this._blinkEvent.remove(); this._blinkEvent = null; }
    if (this._howlGfx?.active) this._howlGfx.destroy();
    this._hpBg.destroy();
    this._hpFill.destroy();
    const sx = this.gameObject.scaleX * 2.0;
    const sy = this.gameObject.scaleY * 2.0;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 300, ease: 'Quad.Out',
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
