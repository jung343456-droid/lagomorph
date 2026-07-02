/**
 * 오소리 (Badger) — 잠행 돌격 탱커 (구역 3, 동물)
 * HP 220 / 속도 115 / 데미지 28(돌진 접촉·할퀴기) / 코어 9
 *
 * 패턴 (돌진 + 근접 콤보 + 잠행 기습):
 *   chase   → 플레이어 추격
 *              · 80px 이내 → 할퀴기 콤보(windup)
 *              · 80~320px + 돌진 쿨다운 0 → 돌진 예고(chargeWind)
 *              · 그 외 + 잠행 쿨다운 0 → burrow
 *   chargeWind → 0.45초 예고. 예고 동안 조준 방향을 천천히 추적(완전 회피는 어렵게) → 막판 고정
 *   charge   → 360px/s 박치기 0.75초(접촉 데미지). 벽에 들이받으면 즉시 종료 → 긴 경직(슬램)
 *   chargeRec→ 박치기 후 경직(약점 노출). 벽 슬램 0.95초 / 일반 0.35초 → chase
 *   windup   → 0.3초 할퀴기 예고(정지)
 *   claw     → 정면 부채꼴(반경 105px) 판정 + 전진 비집기. 최대 2연타(플레이어가 사거리에 남아있으면 추가타)
 *   burrow   → 1.2초 땅속 이동(무적·untargetable, 플레이어 근처로) → emerge. 이동속도 180(반투명)
 *   emerge   → 0.3초 출현 예고 → 기습 할퀴기
 *   stun     → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * charge·burrow 중에는 넉백·경직 면역(탱커 무게감). burrow 중에는 피격 무효 + 접촉 무해 + 트랩 무시(밟지 않음).
 * 공격 예고/발동 시 공격 범위 표시(_drawAttackTelegraph): 할퀴기=정면 반원 부채꼴. 돌진은 표시 없음(방향·모션으로만 예고).
 * speedMult: 공용 속도 배수 경유 (추격·잠행 이동에 적용, 돌진 속도는 고정)
 */
const DETECT_R      = 360;
const CHASE_SPEED   = 115;
const CLAW_RANGE    = 80;
const CLAW_R        = 105;   // 할퀴기 판정 반경
const CLAW_LUNGE    = 120;   // 스윙 중 전진 속도
const WINDUP_DUR    = 0.3;
const CLAW_DUR      = 0.2;   // 한 스윙당 지속
const CLAW_COMBO    = 2;     // 최대 연타 수
const CHARGE_MAX    = 320;   // 돌진 발동 최대 거리
const CHARGE_WIND   = 0.45;
const CHARGE_SPEED  = 360;
const CHARGE_DUR    = 0.75;  // 돌진 최대 지속
const CHARGE_CD     = 3.2;
const CHARGE_RECOVER = 0.35;
const SLAM_RECOVER  = 0.95;  // 벽 슬램 시 경직(약점 노출)
const TRACK_RATE    = 3.5;   // 예고 중 조준 추적 속도
const BURROW_CD     = 6.0;
const BURROW_DUR    = 1.2;
const BURROW_SPEED  = 180;   // 잠행 이동속도 (기존 200의 90% — 회피 기회 완화)
const EMERGE_DUR    = 0.3;
const CLAW_COLOR    = 0xff5522;  // 할퀴기 범위 표시 (돌진은 텔레그래프 없음)
const BG_W          = 32;
const BG_H          = 26;
const BG_DW         = 60;
const BG_DH         = 60;

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

// 상태: chase | chargeWind | charge | chargeRec | windup | claw | burrow | emerge | stun
export default class Badger {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 220;
    this.maxHp  = 220;
    this.speed  = CHASE_SPEED;
    this.damage = 28;
    this.displayName = '오소리';

    this.state      = 'chase';
    this._prevState = 'chase';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 9;
    this.speedMult = 1.0;

    this._stateTimer = 0;
    this._burrowCd   = BURROW_CD * (0.5 + Math.random() * 0.5);
    this._chargeCd   = CHARGE_CD * (0.3 + Math.random() * 0.6);
    this._faceX = 0;
    this._faceY = 1;
    this._clawDone  = false;
    this._clawIndex = 0;
    this._chargeVx = 0;
    this._chargeVy = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'badger-s';

    this.gameObject = scene.add.image(x, y, 'badger-s').setDisplaySize(BG_DW, BG_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.setDepth(9);

    this._atkGfx = scene.add.graphics().setDepth(8);  // 공격 범위 표시(바닥 위)

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'chase': {
        if (dist >= DETECT_R) { this.gameObject.body.setVelocity(0, 0); break; }
        this._burrowCd -= dt;
        this._chargeCd -= dt;
        if (dist <= CLAW_RANGE) {
          this._enterWindup(dx, dy, dist);
          break;
        }
        if (this._chargeCd <= 0 && dist <= CHARGE_MAX) {
          this._faceX = dist > 0 ? dx / dist : 0;
          this._faceY = dist > 0 ? dy / dist : 1;
          this.state = 'chargeWind';
          this._stateTimer = CHARGE_WIND;
          this.gameObject.body.setVelocity(0, 0);
          break;
        }
        if (this._burrowCd <= 0) {
          this.state = 'burrow';
          this._stateTimer = BURROW_DUR;
          this.gameObject.setAlpha(0.35);
          break;
        }
        this._moveTo(dx, dy, dist, CHASE_SPEED * this.speedMult);
        break;
      }

      case 'chargeWind': {
        this.gameObject.body.setVelocity(0, 0);
        // 예고 동안 조준을 천천히 추적 → 막판 고정 (완전 회피는 어렵지만 텔레그래프는 공정)
        if (dist > 0) {
          const tx = dx / dist, ty = dy / dist;
          this._faceX += (tx - this._faceX) * Math.min(1, TRACK_RATE * dt);
          this._faceY += (ty - this._faceY) * Math.min(1, TRACK_RATE * dt);
        }
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          const m = Math.hypot(this._faceX, this._faceY) || 1;
          this._chargeVx = (this._faceX / m) * CHARGE_SPEED;
          this._chargeVy = (this._faceY / m) * CHARGE_SPEED;
          this.state = 'charge';
          this._stateTimer = CHARGE_DUR;
        }
        break;
      }

      case 'charge': {
        this.gameObject.body.setVelocity(this._chargeVx, this._chargeVy);
        this._stateTimer -= dt;
        const b = this.gameObject.body;
        const slammed = b.blocked.left || b.blocked.right || b.blocked.up || b.blocked.down ||
                        b.touching.left || b.touching.right || b.touching.up || b.touching.down;
        if (slammed) {
          this.state = 'chargeRec';
          this._stateTimer = SLAM_RECOVER;
          this._chargeCd = CHARGE_CD;
          this.gameObject.body.setVelocity(0, 0);
        } else if (this._stateTimer <= 0) {
          this.state = 'chargeRec';
          this._stateTimer = CHARGE_RECOVER;
          this._chargeCd = CHARGE_CD;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;
      }

      case 'chargeRec':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) this.state = 'chase';
        break;

      case 'windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'claw';
          this._stateTimer = CLAW_DUR;
          this._clawDone = false;
          this._clawIndex = 0;
        }
        break;

      case 'claw':
        // 스윙 중 정면으로 비집고 들어간다 (묵직한 전진)
        this.gameObject.body.setVelocity(this._faceX * CLAW_LUNGE, this._faceY * CLAW_LUNGE);
        if (!this._clawDone) {
          this._clawDone = true;
          this._doClaw(player, dx, dy, dist);
        }
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this._clawIndex++;
          // 플레이어가 아직 사거리에 남아있으면 추가타 (탱커 추적 콤보)
          if (this._clawIndex < CLAW_COMBO && dist <= CLAW_R + 30) {
            this._faceX = dist > 0 ? dx / dist : this._faceX;
            this._faceY = dist > 0 ? dy / dist : this._faceY;
            this._stateTimer = CLAW_DUR;
            this._clawDone = false;
          } else {
            this.gameObject.body.setVelocity(0, 0);
            this.state = 'chase';
          }
        }
        break;

      case 'burrow':
        // 무적·접촉 무해 — 매 프레임 attackCooldown 유지로 접촉 데미지 차단
        this.attackCooldown = 1;
        this._moveTo(dx, dy, dist, BURROW_SPEED * this.speedMult);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.gameObject.setAlpha(1);
          this.attackCooldown = 0;
          this.state = 'emerge';
          this._stateTimer = EMERGE_DUR;
          this._faceX = dist > 0 ? dx / dist : 0;
          this._faceY = dist > 0 ? dy / dist : 1;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'emerge':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'claw';
          this._stateTimer = CLAW_DUR;
          this._clawDone = false;
          this._clawIndex = 0;
          this._burrowCd = BURROW_CD;
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
    this._drawAttackTelegraph();
    this._syncHpBar();
  }

  takeDamage(amount, knockback = null, opts = {}) {
    // 잠행(burrow) 중 무적
    if (!this.alive || this.state === 'stun' || this.state === 'burrow') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    // 돌진 중엔 넉백·경직 면역 (탱커가 박치기를 멈추지 않는다)
    if (this.state !== 'charge' && !opts.noStagger) {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = (this.state === 'windup' || this.state === 'emerge' ||
                         this.state === 'claw'   || this.state === 'chargeWind') ? 'chase' : this.state;
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
    if (this._atkGfx?.active) this._atkGfx.destroy();
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _enterWindup(dx, dy, dist) {
    this._faceX = dist > 0 ? dx / dist : 0;
    this._faceY = dist > 0 ? dy / dist : 1;
    this.state = 'windup';
    this._stateTimer = WINDUP_DUR;
    this.gameObject.body.setVelocity(0, 0);
  }

  /** 정면 부채꼴 할퀴기 — 반경 CLAW_R 내 + 전방 반원(dot > 0)일 때만 명중 */
  _doClaw(player, dx, dy, dist) {
    if (dist > CLAW_R) return;
    const len = dist > 0 ? dist : 1;
    const dot = (dx / len) * this._faceX + (dy / len) * this._faceY;
    if (dot <= 0) return; // 등 뒤 안전
    player.lastDamageSource = '오소리' + (this.isElite ? ' (정예)' : '');
    const dead = player.takeDamage(this.damage, {
      dx: dx / len, dy: dy / len, force: 240, duration: 0.18,
    });
    if (dead) this.scene.events.emit('player-dead');
  }

  /**
   * 공격 범위 표시 — 매 프레임 갱신.
   *   할퀴기(windup/claw): 정면 반원(반경 CLAW_R, dot>0 판정과 일치) 부채꼴. windup=예고(옅게), claw=발동(진하게)
   *   돌진(chargeWind/charge): 표시 없음 — 조준 방향과 예고 모션으로만 알린다.
   *   그 외 상태에서는 지운다.
   */
  _drawAttackTelegraph() {
    const gfx = this._atkGfx;
    if (!gfx) return;
    gfx.clear();
    const s = this.state;
    const { x, y } = this.gameObject;
    const angle = Math.atan2(this._faceY, this._faceX);

    if (s === 'windup' || s === 'claw') {
      const active = s === 'claw';
      const a0 = angle - Math.PI / 2, a1 = angle + Math.PI / 2;
      gfx.fillStyle(CLAW_COLOR, active ? 0.28 : 0.15);
      gfx.slice(x, y, CLAW_R, a0, a1, false);
      gfx.fillPath();
      gfx.lineStyle(2, CLAW_COLOR, active ? 0.9 : 0.5);
      gfx.beginPath();
      gfx.arc(x, y, CLAW_R, a0, a1);
      gfx.strokePath();
    }
    // 돌진(chargeWind/charge)은 공격 범위 표시 없음 — 조준 방향·모션으로만 예고.
  }

  _moveTo(dx, dy, dist, speed) {
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    this.gameObject.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 액션 상태도 전용 스프라이트 없이 이동 방향 스프라이트를 그대로 사용한다.
    // 돌진·할퀴기처럼 조준 방향이 고정된 상태에서는 face 벡터로 방향을 잡는다.
    let dir;
    if (this.state === 'chargeWind' || this.state === 'charge' ||
        this.state === 'windup' || this.state === 'claw' || this.state === 'emerge') {
      dir = calcDir(this._faceX, this._faceY);
    } else {
      dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    }
    if (dir) this._lastDir = dir;
    const key = `badger-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(BG_DW, BG_DH);
      this._applyBodySize();
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(BG_W / sx, BG_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 35, BG_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - BG_DW / 2, y - 35, BG_DW, 4, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 35);
    this._hpFill.setPosition(x - BG_DW / 2, y - 35);
    this._hpFill.width = BG_DW * Math.max(0, this.hp / this.maxHp);
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
    if (this._atkGfx?.active) this._atkGfx.destroy();
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
