/**
 * 뱀 (Snake) — 잠복 기습 + 물고 매달리기 (구역 3, 동물)
 * HP 80 / 속도 140 / 데미지: 물기 명중 시 매달려 지속 8dps(틱당 4)×5s / 코어 5
 *
 * 패턴:
 *   lurk   → 저속 배회(풀숲 잠복). 140px 이내 진입 시 windup 전환
 *   windup → 0.3초 예고(정지, 대시 방향 고정)
 *   strike → 360px/s 직선 런지 0.35초. 물기 명중 시 cling 전환(매달림)
 *   cling  → 플레이어에 부착 추종. 이속 ×0.8(player.applyBiteSlow) + 지속 데미지(8dps=틱당 4, 0.5초 틱).
 *            틱마다 독액 연출(_biteFX): 뱀 머리 초록 점멸 + 독색 데미지 숫자로 DoT 가시화.
 *            최대 5초. 매달린 동안 피격당 1 데미지만 받고 넉백·경직 면역, 3회 피격 시 탈락.
 *            5초 경과 시 피격 횟수와 무관하게 탈락(→ retreat). 부착 중 접촉 데미지는 억제.
 *   retreat→ 0.4초 후퇴 후 lurk 복귀
 *   stun   → 피격 시 0.3초 경직 + 넉백 (이 시간 동안 추가 피격 무시 = i-frame)
 *
 * 지속 데미지: 매달린 동안 player.takeDamage(bypassArmor) 직접 틱 — 방어력 관통.
 * speedMult: Wolf 오라 등 공용 속도 배수 경유 (배회·후퇴에 적용, 런지 속도는 고정)
 * 렌더: 8방향 스프라이트 대신 남향 이미지(snake-s) 하나만 쓰고 진행 방향으로 회전(rotFor).
 *       매달림 중엔 부착 시 고정한 회전값(_clingRot, 머리가 플레이어를 향함)을 유지한다.
 */
const DETECT_R    = 140;
const LURK_SPEED  = 140;
const STRIKE_SPEED = 360;
const WINDUP_DUR  = 0.3;
const STRIKE_DUR  = 0.35;
const RETREAT_DUR = 0.4;
const BITE_R      = 28;   // 물기 명중 판정 반경 (매달림 부착)
const CLING_DUR   = 5;    // 매달림 최대 지속 (s) — 경과 시 피격 횟수 무관 탈락
const CLING_HITS  = 3;    // 매달림 중 탈락까지 필요한 피격 횟수
const CLING_BITE_DMG = 1; // 매달림 중 피격당 뱀이 받는 데미지
const CLING_DPS   = 8;    // 매달림 중 플레이어 지속 데미지(초당) — 0.5초 틱 기준 틱당 4
const VENOM_COLOR = '#88ff33'; // DoT 데미지 숫자·머리 점멸에 쓰는 독액 색
const CLING_TICK  = 0.5;  // 지속 데미지 틱 간격 (s)
const CLING_OFFSET = 16;  // 부착 시 플레이어로부터의 표시 오프셋 (px)
const BITE_SLOW_REFRESH = 0.2; // 매 프레임 갱신하는 이속 슬로우 잔여 시간 (s)
const LURK_FLIP   = 1.6;  // 배회 방향 전환 주기 (s)
const SNAKE_W     = 22;
const SNAKE_H     = 16;
const SNAKE_DW    = 60;
const SNAKE_DH    = 60;

// 뱀은 아래(남쪽) 방향 스프라이트 하나(snake-s)만 사용하고, 진행 방향으로 회전시킨다.
//   기본 이미지가 남향(아래) → 이동 각도(atan2(vy,vx))에서 남향 각도(π/2)를 빼면 회전값.
const SOUTH_ANGLE = Math.PI / 2;
function rotFor(vx, vy) {
  return Math.atan2(vy, vx) - SOUTH_ANGLE;
}

// 상태: lurk | windup | strike | cling | retreat | stun
export default class Snake {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 80;
    this.maxHp  = 80;
    this.speed  = LURK_SPEED;
    this.damage = 18;
    this.displayName = '뱀';

    this.state      = 'lurk';
    this._prevState = 'lurk';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 5;
    this.speedMult = 1.0;

    this._stateTimer  = 0;
    this._lurkFlip    = LURK_FLIP * Math.random();
    this._lurkAngle   = Math.random() * Math.PI * 2;
    this._strikeVx    = 0;
    this._strikeVy    = 0;
    this._bitThisStrike = false;

    this._clingTimer  = 0;
    this._clingTick   = 0;
    this._clingHits   = 0;
    this._clingOffX   = 0;
    this._clingOffY   = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastRot = 0;   // 마지막 진행 방향 회전값 (정지 시 유지)
    this._clingRot = 0;  // 매달림 중 고정 회전값 (머리가 플레이어를 향함)

    this.gameObject = scene.add.image(x, y, 'snake-s').setDisplaySize(SNAKE_DW, SNAKE_DH);
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

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'lurk':
        this._updateLurk(dt);
        if (dist < DETECT_R) {
          const len = dist > 0 ? dist : 1;
          this._strikeVx = (dx / len) * STRIKE_SPEED;
          this._strikeVy = (dy / len) * STRIKE_SPEED;
          this.state = 'windup';
          this._stateTimer = WINDUP_DUR;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'strike';
          this._stateTimer = STRIKE_DUR;
          this._bitThisStrike = false;
        }
        break;

      case 'strike':
        this.gameObject.body.setVelocity(this._strikeVx, this._strikeVy);
        // 물기 — 근접 명중 시 매달림(cling) 전환
        if (!this._bitThisStrike && dist < BITE_R) {
          this._bitThisStrike = true;
          this._attach(player);
          break;
        }
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'retreat';
          this._stateTimer = RETREAT_DUR;
        }
        break;

      case 'cling': {
        // 플레이어에 부착 추종 — 위치 고정, 이속 슬로우·지속 데미지·접촉 데미지 억제
        this.gameObject.body.setVelocity(0, 0);
        this.gameObject.setPosition(player.x + this._clingOffX, player.y + this._clingOffY);
        player.applyBiteSlow?.(BITE_SLOW_REFRESH);
        this.attackCooldown = 0.5; // 접촉 데미지 억제 (자체 DoT 사용)
        this._clingTick -= dt;
        if (this._clingTick <= 0) {
          this._clingTick += CLING_TICK;
          const dmg = Math.max(1, Math.round(CLING_DPS * CLING_TICK));
          player.lastDamageSource = '뱀';
          const dead = player.takeDamage(dmg, null, { bypassArmor: true, damageColor: VENOM_COLOR });
          if (dead) this.scene.events.emit('player-dead');
          this._biteFX();
        }
        this._clingTimer -= dt;
        if (this._clingTimer <= 0) this._detach(); // 5초 경과 — 피격 횟수 무관 탈락
        break;
      }

      case 'retreat': {
        const len = dist > 0 ? dist : 1;
        this.gameObject.body.setVelocity(
          (-dx / len) * LURK_SPEED * this.speedMult,
          (-dy / len) * LURK_SPEED * this.speedMult,
        );
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) this.state = 'lurk';
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

  takeDamage(amount, knockback = null, opts = {}) {
    if (!this.alive) return false;
    // 매달림 중 — 피격당 1 데미지만, 넉백·경직 면역. 3회 누적 시 탈락.
    if (this.state === 'cling') {
      this.hp -= CLING_BITE_DMG;
      this._blinkHit();
      if (this.hp <= 0) { this._die(); return true; }
      this._clingHits++;
      if (this._clingHits >= CLING_HITS) this._detach();
      return false;
    }
    if (this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    // 런지 중 피격은 넉백·경직 면역(돌진 유지) — 그 외엔 경직
    if (this.state !== 'strike' && !opts.noStagger) {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = (this.state === 'windup') ? 'lurk' : this.state;
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

  _attach(player) {
    // 부착 방향(플레이어→뱀)으로 표시 오프셋, 머리는 플레이어 쪽을 향하도록 스프라이트 정렬
    const dx  = this.gameObject.x - player.x;
    const dy  = this.gameObject.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    this._clingOffX = (dx / len) * CLING_OFFSET;
    this._clingOffY = (dy / len) * CLING_OFFSET;
    // 머리가 플레이어 쪽(부착 오프셋의 반대)을 향하도록 회전 고정
    this._clingRot  = rotFor(-this._clingOffX, -this._clingOffY);

    this.state       = 'cling';
    this._clingTimer = CLING_DUR;
    this._clingTick  = CLING_TICK;
    this._clingHits  = 0;
  }

  _detach() {
    this._clingHits  = 0;
    this.state       = 'retreat';
    this._stateTimer = RETREAT_DUR;
  }

  _updateLurk(dt) {
    this._lurkFlip -= dt;
    if (this._lurkFlip <= 0) {
      this._lurkFlip  = LURK_FLIP;
      this._lurkAngle = Math.random() * Math.PI * 2;
    }
    this.gameObject.body.setVelocity(
      Math.cos(this._lurkAngle) * LURK_SPEED * 0.5 * this.speedMult,
      Math.sin(this._lurkAngle) * LURK_SPEED * 0.5 * this.speedMult,
    );
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 단일 스프라이트(snake-s)를 진행 방향으로 회전. 매달림 중엔 부착 시 고정한 회전값 유지.
    if (this.state === 'cling') {
      this.gameObject.setRotation(this._clingRot);
      return;
    }
    const vx = this.gameObject.body.velocity.x;
    const vy = this.gameObject.body.velocity.y;
    if (Math.abs(vx) >= 1 || Math.abs(vy) >= 1) this._lastRot = rotFor(vx, vy);
    this.gameObject.setRotation(this._lastRot);
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(SNAKE_W / sx, SNAKE_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 35, SNAKE_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - SNAKE_DW / 2, y - 35, SNAKE_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 18);
    this._hpFill.setPosition(x - SNAKE_DW / 2, y - 18);
    this._hpFill.width = SNAKE_DW * Math.max(0, this.hp / this.maxHp);
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

  _biteFX() {
    // 매달림 DoT 틱 연출 — 뱀 머리 독색 점멸 + 부착점에서 독액이 번지는 팝(사각 스케일 페이드).
    // add.circle 금지 규칙에 따라 rectangle 로 링을 대체한다.
    this.gameObject.setTintFill(0x66ff22);
    this.scene.time.delayedCall(110, () => {
      if (!this.destroyed && this.state === 'cling') this.gameObject.clearTint();
    });
    const pop = this.scene.add.rectangle(this.gameObject.x, this.gameObject.y, 14, 14, 0x88ff33)
      .setDepth(10).setAlpha(0.85);
    this.scene.tweens.add({
      targets: pop,
      scaleX: 2.6, scaleY: 2.6, alpha: 0,
      duration: 300, ease: 'Quad.Out',
      onComplete: () => { if (pop.active) pop.destroy(); },
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
