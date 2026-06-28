/**
 * 단검 사냥꾼 (DaggerHunter) — 근접 연타 추격형 (구역 3, 인간)
 * HP 160 / 속도 185 / 데미지 24(접촉)·12×n(연타 콤보) / 코어 7
 *
 * 패턴 (기습 대시 + 다단 연타 + 위빙):
 *   idle    → chase(340px 이내 탐지)
 *   chase   → 플레이어 추격
 *              · 64px 이내 → 연타 콤보(windup)
 *              · 64~240px + 대시 쿨다운 0 → 기습 대시(dash)
 *   dash    → 440px/s 직선 대시 0.3초(거리 좁히면 즉시 콤보). 접촉 데미지
 *   windup  → 0.22초 예고(방향 고정)
 *   slash   → 단검 연타 콤보. 슬래시마다 전진 비집기 + 수동 판정(12 데미지),
 *             플레이어가 사거리에 남아있으면 방향 재조준해 최대 3연타(분노 4연타)
 *   recover → 0.4초 경직(약점 노출) → strafe 또는 chase
 *   strafe  → 50% 확률로 0.35초 측면 위빙(플레이어 주위를 돈다) → chase
 *   stun    → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 분노(HP 30% 이하): 연타 4회, recover 0.22초, 추격·대시 속도 ×1.2
 * slash 중엔 넉백·경직 면역(콤보 커밋). 콤보 동안 전역 접촉 억제 → 슬래시 수동 판정만 적용(중복 방지).
 * speedMult: Wolf 오라·구역 강화·까마귀 표식 등 공용 속도 배수 경유 (추격·대시에 적용, 슬래시 전진은 고정)
 */
const DETECT_R      = 340;
const CHASE_SPEED   = 185;
const SLASH_RANGE   = 64;
const SLASH_REACH   = 78;    // 슬래시 명중 반경
const SLASH_SPEED   = 320;   // 슬래시 중 전진 속도
const SLASH_DMG     = 12;    // 슬래시 1타 데미지
const WINDUP_DUR    = 0.22;
const SLASH_DUR     = 0.13;  // 한 슬래시 지속
const COMBO_HITS      = 3;
const COMBO_HITS_RAGE = 4;
const RECOVER_DUR   = 0.4;
const RECOVER_RAGE  = 0.22;
const DASH_RANGE    = 240;   // 대시 발동 최대 거리
const DASH_SPEED    = 440;
const DASH_DUR      = 0.3;
const DASH_CD       = 2.0;
const STRAFE_DUR    = 0.35;
const STRAFE_CHANCE = 0.5;
const RAGE_SPD      = 1.2;
const DH_W          = 24;
const DH_H          = 40;
const DH_DW         = 60;
const DH_DH         = 60;

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

// 상태: idle | chase | dash | windup | slash | recover | strafe | stun
export default class DaggerHunter {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 160;
    this.maxHp  = 160;
    this.speed  = CHASE_SPEED;
    this.damage = 24;
    this.displayName = '단검 사냥꾼';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 7;
    this.speedMult = 1.0;

    this._stateTimer = 0;
    this._faceX = 0;
    this._faceY = 1;
    this._dashVx = 0;
    this._dashVy = 0;
    this._dashCd = DASH_CD * (0.3 + Math.random() * 0.6);
    this._slashDone  = false;
    this._slashIndex = 0;
    this._strafeSign = 1;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'daggerhunter-s';

    this.gameObject = scene.add.image(x, y, 'daggerhunter-s').setDisplaySize(DH_DW, DH_DH);
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
    const rage = this.hp / this.maxHp <= 0.3;

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
        this._dashCd -= dt;
        if (dist <= SLASH_RANGE) {
          this._enterCombo(dx, dy, dist);
          break;
        }
        if (this._dashCd <= 0 && dist <= DASH_RANGE) {
          const len = dist > 0 ? dist : 1;
          const spd = DASH_SPEED * this.speedMult * (rage ? RAGE_SPD : 1);
          this._faceX = dx / len; this._faceY = dy / len;
          this._dashVx = this._faceX * spd;
          this._dashVy = this._faceY * spd;
          this.state = 'dash';
          this._stateTimer = DASH_DUR;
          break;
        }
        const spd = CHASE_SPEED * this.speedMult * (rage ? RAGE_SPD : 1);
        this._moveTo(dx, dy, dist, spd);
        break;
      }

      case 'dash':
        this.gameObject.body.setVelocity(this._dashVx, this._dashVy);
        this._stateTimer -= dt;
        if (dist <= SLASH_RANGE) {
          this._dashCd = DASH_CD;
          this._enterCombo(dx, dy, dist);
        } else if (this._stateTimer <= 0) {
          this._dashCd = DASH_CD;
          this.state = dist < DETECT_R ? 'chase' : 'idle';
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'windup':
        this.gameObject.body.setVelocity(0, 0);
        this.attackCooldown = 1;             // 콤보 동안 전역 접촉 억제
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'slash';
          this._stateTimer = SLASH_DUR;
          this._slashDone = false;
          this._slashIndex = 0;
        }
        break;

      case 'slash':
        // 슬래시 중 전진 비집기 — 약한 넉백을 상쇄하며 따라붙는다
        this.gameObject.body.setVelocity(this._faceX * SLASH_SPEED, this._faceY * SLASH_SPEED);
        this.attackCooldown = 1;             // 전역 접촉 억제 (수동 판정만)
        if (!this._slashDone) {
          this._slashDone = true;
          this._doSlash(player, dx, dy, dist);
        }
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this._slashIndex++;
          const maxHits = rage ? COMBO_HITS_RAGE : COMBO_HITS;
          if (this._slashIndex < maxHits && dist <= SLASH_REACH + 24) {
            // 플레이어가 사거리에 남아있으면 재조준 후 추가타
            const len = dist > 0 ? dist : 1;
            this._faceX = dx / len; this._faceY = dy / len;
            this._stateTimer = SLASH_DUR;
            this._slashDone = false;
          } else {
            this.state = 'recover';
            this._stateTimer = rage ? RECOVER_RAGE : RECOVER_DUR;
            this.gameObject.body.setVelocity(0, 0);
          }
        }
        break;

      case 'recover':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          if (dist < DETECT_R && Math.random() < STRAFE_CHANCE) {
            this.state = 'strafe';
            this._stateTimer = STRAFE_DUR;
            this._strafeSign = Math.random() < 0.5 ? 1 : -1;
          } else {
            this.state = dist < DETECT_R ? 'chase' : 'idle';
          }
        }
        break;

      case 'strafe': {
        // 플레이어 주위를 도는 측면 위빙 (직선 재접근 대신 흔들며 파고든다)
        const len = dist > 0 ? dist : 1;
        const perpX = (-dy / len) * this._strafeSign;
        const perpY = (dx  / len) * this._strafeSign;
        const inward = dist > SLASH_RANGE + 30 ? 0.4 : -0.2; // 너무 멀면 파고들고, 붙으면 살짝 벌린다
        let vx = perpX + (dx / len) * inward;
        let vy = perpY + (dy / len) * inward;
        const m = Math.hypot(vx, vy) || 1;
        const spd = CHASE_SPEED * this.speedMult;
        this.gameObject.body.setVelocity((vx / m) * spd, (vy / m) * spd);
        this._stateTimer -= dt;
        if (dist <= SLASH_RANGE) { this._enterCombo(dx, dy, dist); break; }
        if (this._stateTimer <= 0) this.state = dist < DETECT_R ? 'chase' : 'idle';
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
          this.gameObject.clearTint();
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
    // 슬래시 콤보 중엔 넉백·경직 면역 (커밋된 연타)
    if (this.state !== 'slash') {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = (this.state === 'windup' || this.state === 'dash' ||
                         this.state === 'strafe') ? 'chase' : this.state;
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
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _enterCombo(dx, dy, dist) {
    const len = dist > 0 ? dist : 1;
    this._faceX = dx / len;
    this._faceY = dy / len;
    this.state = 'windup';
    this._stateTimer = WINDUP_DUR;
    this.gameObject.body.setVelocity(0, 0);
  }

  /** 정면 단검 베기 — 반경 SLASH_REACH 내 + 전방 반원(dot > 0)일 때만 명중 */
  _doSlash(player, dx, dy, dist) {
    if (dist > SLASH_REACH) return;
    const len = dist > 0 ? dist : 1;
    const dot = (dx / len) * this._faceX + (dy / len) * this._faceY;
    if (dot <= 0) return; // 등 뒤 안전
    player.lastDamageSource = '단검 사냥꾼' + (this.isElite ? ' (정예)' : '');
    // 약한 넉백 — 콤보가 자멸하지 않도록 (전진 비집기로 따라붙음)
    const dead = player.takeDamage(SLASH_DMG, {
      dx: dx / len, dy: dy / len, force: 90, duration: 0.1,
    });
    if (dead) this.scene.events.emit('player-dead');
  }

  _moveTo(dx, dy, dist, speed) {
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    this.gameObject.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 액션 상태도 전용 스프라이트 없이 이동 방향 스프라이트를 그대로 사용한다.
    // 방향이 고정된 상태(대시·콤보)는 face 벡터로 방향을 잡는다.
    let dir;
    if (this.state === 'dash' || this.state === 'windup' || this.state === 'slash') {
      dir = calcDir(this._faceX, this._faceY);
    } else {
      dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    }
    if (dir) this._lastDir = dir;
    const key = `daggerhunter-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(DH_DW, DH_DH);
      this._applyBodySize();
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(DH_W / sx, DH_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 35, DH_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - DH_DW / 2, y - 35, DH_DW, 4, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 35);
    this._hpFill.setPosition(x - DH_DW / 2, y - 35);
    this._hpFill.width = DH_DW * Math.max(0, this.hp / this.maxHp);
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
