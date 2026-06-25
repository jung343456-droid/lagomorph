/**
 * 두꺼비 (Toad) — 독 원거리병 (구역 2)
 * HP 51 / 속도 72 / 데미지 7(접촉) + 5 독 DoT(진입 즉시 1회, 이후 0.5초마다, 웅덩이 15초 지속) / 코어 3
 *
 * 패턴:
 *   idle      → kite(307px 이내 탐지)
 *   kite      → 100px 이내 접근 시 후퇴, 그 외에는 정지
 *               2.5초마다 spit (HP 30% 이하: 1.5초)
 *   spit_wind → 0.4초 예고
 *   spit      → 0.33초 비행 후 착탄 → 60px 반경 독 웅덩이(지속 4초)
 *   stun      → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 독 웅덩이: 플레이어가 범위에 진입한 순간 즉시 5 피해, 이후 0.5초마다 5 피해 — 방어력(armor/damageReduction) 관통
 *           두꺼비 1마리당 활성 2개 (초과 시 가장 오래된 것 소멸)
 *           엘리트(isElite): spit 당 2개씩 생성(착탄점에서 60px 벌림), 활성 한도 4개
 *           두꺼비 사망 후에도 웅덩이 지속(매니저에 잔존 hazard 등록) — 지속시간 만료·dispose·방 전환(_clearAll) 시 소멸
 *
 * 시각: toad 스프라이트 + 독초록 틴트, 독 웅덩이는 toad-puddle 텍스처 사용
 * speedMult: Wolf 오라(180px 이내) 적용 시 후퇴 속도 ×1.2
 */
const DETECT_R     = 307;
const CLOSE_DIST   = 100;
const RETREAT_SPEED = 72;
const SPIT_CD      = 2.5;
const SPIT_CD_RAGE = 1.5;
const SPIT_WINDUP  = 0.4;
const SPIT_FLIGHT  = 0.333;
const SPIT_SPEED   = 270;
const PUDDLE_RADIUS = 60;   // DoT 판정 반경 — toad-puddle 프레임(120px)의 반(설계 의도)
const PUDDLE_IMG_SIZE = 120; // toad-puddle 텍스처 네이티브 프레임 (1:1 렌더)
const PUDDLE_DUR   = 15.0;
const PUDDLE_MAX   = 2;
const PUDDLE_MAX_ELITE = 4;  // 엘리트는 spit 당 2개 생성하므로 동시 잔존 한도도 2배
const PUDDLE_ELITE_OFFSET = 60; // 엘리트 두 번째 웅덩이를 착탄점에서 벌리는 거리
const PUDDLE_DMG   = 5;       // 틱당 데미지
const PUDDLE_TICK  = 0.5;     // 0.5초마다 적용 (진입 시 즉시 1회)
const TOAD_W       = 22;
const TOAD_H       = 20;
const TOAD_DW      = 36;
const TOAD_DH      = 32;
const TINT         = 0x559933;
const PUDDLE_TINT  = 0x88dd33;

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

// 상태: idle | kite | spit_windup | spit | stun
export default class Toad {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 51;
    this.maxHp  = 51;
    this.speed  = RETREAT_SPEED;
    this.damage = 7;
    this.displayName = '두꺼비';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 3;
    this.speedMult = 1.0;

    this._stateTimer = 0;
    this._spitCd     = SPIT_CD * (0.5 + Math.random() * 0.5);
    this._spitTargetX = 0;
    this._spitTargetY = 0;
    this._spitProjGfx = null;
    this._puddles    = [];   // [{ gfx, timer, x, y, tickTimer }]
    this._player      = null;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'toad-idle';

    this.gameObject = scene.add.image(x, y, 'toad-idle').setDisplaySize(TOAD_DW, TOAD_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.setDepth(9);
    this.gameObject.setTint(TINT);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    this._player = player;
    if (!this.alive) {
      this._tickPuddles(delta / 1000, player);
      return;
    }
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'kite';
        break;

      case 'kite':
        if (dist >= DETECT_R) { this.state = 'idle'; this.gameObject.body.setVelocity(0, 0); break; }
        if (dist < CLOSE_DIST) {
          const len = dist > 0 ? dist : 1;
          this.gameObject.body.setVelocity(
            (-dx / len) * RETREAT_SPEED * this.speedMult,
            (-dy / len) * RETREAT_SPEED * this.speedMult,
          );
        } else {
          this.gameObject.body.setVelocity(0, 0);
        }
        this._spitCd -= dt;
        if (this._spitCd <= 0) {
          this._spitTargetX = player.x;
          this._spitTargetY = player.y;
          this.state = 'spit_windup';
          this._stateTimer = SPIT_WINDUP;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'spit_windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this._startSpit();
        }
        break;

      case 'spit':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._spitProjGfx?.active) {
          // 보간 — start 위치에서 target 위치로 비행
          const t = 1 - this._stateTimer / SPIT_FLIGHT;
          const sx = this._spitStartX + (this._spitTargetX - this._spitStartX) * t;
          const sy = this._spitStartY + (this._spitTargetY - this._spitStartY) * t;
          // 포물선 — 중간에 약간 올라갔다가 내려감
          const arc = Math.sin(t * Math.PI) * 16;
          this._spitProjGfx.setPosition(sx, sy - arc);
        }
        if (this._stateTimer <= 0) {
          if (this._spitProjGfx?.active) this._spitProjGfx.destroy();
          this._spitProjGfx = null;
          this._spawnPuddle(this._spitTargetX, this._spitTargetY);
          this._spitCd = this.hp / this.maxHp <= 0.3 ? SPIT_CD_RAGE : SPIT_CD;
          this.state = 'kite';
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
          this.gameObject.setTint(TINT);
          this.state = this._prevState;
        }
        break;
    }

    this._tickPuddles(dt, player);
    this._updateSprite();
    this._syncHpBar();
  }

  takeDamage(amount, knockback = null) {
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (knockback) {
      const { dx, dy, force, duration } = knockback;
      this._knockbackTimer    = duration;
      this._knockbackDuration = duration;
      this._knockbackVx = dx * force;
      this._knockbackVy = dy * force;
    }
    this._prevState = (this.state === 'spit' || this.state === 'spit_windup') ? 'kite' : this.state;
    if (this._spitProjGfx?.active) { this._spitProjGfx.destroy(); this._spitProjGfx = null; }
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
    if (this._spitProjGfx?.active) this._spitProjGfx.destroy();
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.disposeHazards();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  /** 사망 후 잔존 독 웅덩이 갱신 — EnemyManager.update 가 _lingeringHazards 를 순회하며 매 프레임 호출.
   *  모두 사라지면 스스로 정리(매니저 등록 해제). */
  tickLingering(delta, player) {
    this._tickPuddles(delta / 1000, player ?? this._player);
    if (this._puddles.length === 0) this.disposeHazards();
  }

  /** 독 웅덩이 정리 — destroyed 여부와 무관하게 동작(사망 후 잔존분 정리용).
   *  dispose() 및 EnemyManager.clearLingeringHazards()(방 전환마다 호출, _clearAll 포함)에서 공용 호출. */
  disposeHazards() {
    this._puddles.forEach(p => { if (p.gfx?.active) p.gfx.destroy(); });
    this._puddles = [];
    this.scene.enemyManager?.unregisterLingeringHazard?.(this);
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _startSpit() {
    this.state = 'spit';
    this._stateTimer = SPIT_FLIGHT;
    this._spitStartX = this.gameObject.x;
    this._spitStartY = this.gameObject.y;
    // 투사체 그래픽
    const gfx = this.scene.add.graphics().setDepth(8);
    gfx.fillStyle(PUDDLE_TINT, 0.9);
    gfx.fillCircle(0, 0, 6);
    gfx.lineStyle(1, 0x336611, 1);
    gfx.strokeCircle(0, 0, 6);
    gfx.setPosition(this._spitStartX, this._spitStartY);
    this._spitProjGfx = gfx;
  }

  _spawnPuddle(x, y) {
    this._addPuddle(x, y);

    // 엘리트는 독 웅덩이를 2개씩 생성 — 착탄점 옆에 하나 더 펼쳐 독 범위를 넓힌다
    if (this.isElite) {
      const ang = Math.random() * Math.PI * 2;
      this._addPuddle(
        x + Math.cos(ang) * PUDDLE_ELITE_OFFSET,
        y + Math.sin(ang) * PUDDLE_ELITE_OFFSET,
      );
    }
  }

  _addPuddle(x, y) {
    const gfx = this.scene.add.image(x, y, 'toad-puddle')
      .setDisplaySize(PUDDLE_IMG_SIZE, PUDDLE_IMG_SIZE)
      .setDepth(7);
    this._puddles.push({ gfx, timer: PUDDLE_DUR, x, y, tickTimer: PUDDLE_TICK, wasInside: false });
    const max = this.isElite ? PUDDLE_MAX_ELITE : PUDDLE_MAX;
    while (this._puddles.length > max) {
      const old = this._puddles.shift();
      if (old.gfx?.active) old.gfx.destroy();
    }
  }

  _tickPuddles(dt, player) {
    this._puddles = this._puddles.filter(p => {
      p.timer -= dt;
      if (p.timer <= 0) {
        if (p.gfx?.active) p.gfx.destroy();
        return false;
      }
      if (p.timer < 0.8 && p.gfx?.active) p.gfx.setAlpha(p.timer / 0.8);

      // 플레이어 overlap → 진입 즉시 1회 + 0.5초마다 DoT
      const dx = player.x - p.x;
      const dy = player.y - p.y;
      const inside = dx * dx + dy * dy < PUDDLE_RADIUS * PUDDLE_RADIUS;
      if (inside) {
        if (!p.wasInside || (p.tickTimer -= dt) <= 0) {
          p.tickTimer = PUDDLE_TICK;
          p.wasInside = true;
          // 직접 데미지 적용 (인접 invincible 프레임은 player.takeDamage 가 처리)
          // 독 피해는 방어력(armor/damageReduction) 관통
          player.lastDamageSource = '독 웅덩이' + (this.isElite ? ' (정예)' : '');
          const dead = player.takeDamage(PUDDLE_DMG, null, { bypassArmor: true });
          if (dead) this.scene.events.emit('player-dead');
        }
      } else {
        p.wasInside = false;
        p.tickTimer = PUDDLE_TICK;
      }
      return true;
    });
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    let key;
    if (this.state === 'spit' || this.state === 'spit_windup') {
      key = 'toad-spit';
    } else if (this.state === 'idle' || (this.state === 'kite' && Math.abs(this.gameObject.body.velocity.x) < 1 && Math.abs(this.gameObject.body.velocity.y) < 1)) {
      key = 'toad-idle';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `toad-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(TOAD_DW, TOAD_DH);
      this._applyBodySize();
      this.gameObject.setTint(TINT);
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(TOAD_W / sx, TOAD_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 22, TOAD_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - TOAD_DW / 2, y - 22, TOAD_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 22);
    this._hpFill.setPosition(x - TOAD_DW / 2, y - 22);
    this._hpFill.width = TOAD_DW * Math.max(0, this.hp / this.maxHp);
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
        else { this.gameObject.clearTint(); this.gameObject.setTint(TINT); }
      },
    });
  }

  _die() {
    this.alive = false;
    this.gameObject.body.setEnable(false);
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    if (this._spitProjGfx?.active) this._spitProjGfx.destroy();
    this._hpBg.destroy();
    this._hpFill.destroy();
    const sx = this.gameObject.scaleX * 1.8;
    const sy = this.gameObject.scaleY * 1.8;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 260, ease: 'Quad.Out',
      onComplete: () => {
        this.gameObject.destroy();
        this.destroyed = true;
        // EnemyManager 에서 제거된 이후에도 남은 웅덩이는 매니저가 _lingeringHazards 로 직접
        // 틱한다(tickLingering). 방 전환 시 clearLingeringHazards 로 일괄 정리.
        if (this._puddles.length > 0) {
          this.scene.enemyManager?.registerLingeringHazard?.(this);
        }
      },
    });
  }
}
