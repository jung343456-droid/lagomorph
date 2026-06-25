/**
 * 거미 (Spider) — 지역 차단형 (구역 2, 신규 역할)
 * HP 45 / 속도 99 / 데미지 9(접촉) / 코어 3
 *
 * 패턴:
 *   idle       → reposition(256px 이내 탐지)
 *   reposition → 플레이어 측면으로 횡이동, 정면 회피
 *                플레이어가 거미줄 패치 안에 있으면 attack 상태로 전환
 *   web_throw  → 3초마다 플레이어 위치+α에 거미줄 패치(반경 55px, 15초 지속) 투척
 *   attack     → 플레이어를 향해 직진 접근 (접촉 데미지로 처벌)
 *                플레이어가 모든 거미줄에서 벗어나면 reposition 복귀
 *   stun       → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 거미줄: 플레이어 위에 있을 때 이동속도 ×0.3 슬로우 (Player._slowTimer 갱신)
 *         거미 본체는 거미줄 영향 없음 (slow는 player에게만 적용)
 *         거미 1마리당 활성 2개 (초과 시 가장 오래된 거미줄 소멸)
 *         엘리트(isElite): throw 당 2개씩 생성(진행 방향 수직으로 60px 벌림), 활성 한도 4개
 *         거미 사망 후에도 거미줄 지속(매니저에 잔존 hazard 등록) — 지속시간 만료·dispose·방 전환(_clearAll) 시 소멸
 *
 * 시각: spider 스프라이트 + 검은 틴트, 거미줄은 spider-web 텍스처 사용
 * speedMult: Wolf 오라(180px 이내) 적용 시 횡이동 속도 ×1.2
 */
const DETECT_R    = 256;
const KITE_SPEED  = 99;
const WEB_CD      = 3.0;
const WEB_RADIUS  = 55;   // 슬로우 판정 반경 — spider-web 프레임(110px)의 반(설계 의도)
const WEB_IMG_SIZE = 110; // spider-web 텍스처 네이티브 프레임 (1:1 렌더)
const WEB_DUR     = 15.0;
const WEB_MAX     = 2;
const WEB_MAX_ELITE = 4;  // 엘리트는 throw 당 2개 생성하므로 동시 잔존 한도도 2배
const WEB_ELITE_OFFSET = 60; // 엘리트 두 번째 거미줄을 진행 방향 좌우로 벌리는 거리
const LATERAL_FLIP = 1.5;
const SPIDER_W    = 22;
const SPIDER_H    = 22;
const SPIDER_DW   = 36;
const SPIDER_DH   = 36;
const TINT        = 0x333344;

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

// 상태: idle | reposition | throw | stun
export default class Spider {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 45;
    this.maxHp  = 45;
    this.speed  = KITE_SPEED;
    this.damage = 9;
    this.displayName = '거미';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 3;
    this.speedMult = 1.0;

    this._webCd       = WEB_CD * (0.4 + Math.random() * 0.6);
    this._throwFlash  = 0;
    this._lateralSign = Math.random() < 0.5 ? 1 : -1;
    this._lateralFlip = LATERAL_FLIP;
    this._webs        = [];  // [{ gfx, timer, x, y }]
    this._player      = null;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'spider-idle';

    this.gameObject = scene.add.image(x, y, 'spider-idle').setDisplaySize(SPIDER_DW, SPIDER_DH);
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
      this._tickWebs(delta / 1000, player);
      return;
    }
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this._throwFlash > 0) this._throwFlash -= dt;

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'reposition';
        break;

      case 'reposition':
        if (dist >= DETECT_R) { this.state = 'idle'; this.gameObject.body.setVelocity(0, 0); break; }
        if (this._playerOnWeb(player)) { this.state = 'attack'; break; }
        this._updateReposition(dx, dy, dist, dt);
        this._webCd -= dt;
        if (this._webCd <= 0) {
          this._throwWeb(dx, dy, dist, player);
          this._webCd = WEB_CD;
          this._throwFlash = 0.3;
        }
        break;

      case 'attack':
        if (!this._playerOnWeb(player)) { this.state = 'reposition'; break; }
        this._chasePlayer(dx, dy, dist);
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

    this._tickWebs(dt, player);
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
    this._prevState = this.state;
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
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.disposeHazards();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  /** 사망 후 잔존 거미줄 갱신 — EnemyManager.update 가 _lingeringHazards 를 순회하며 매 프레임 호출.
   *  모두 사라지면 스스로 정리(매니저 등록 해제). */
  tickLingering(delta, player) {
    this._tickWebs(delta / 1000, player ?? this._player);
    if (this._webs.length === 0) this.disposeHazards();
  }

  /** 거미줄 정리 — destroyed 여부와 무관하게 동작(사망 후 잔존분 정리용).
   *  dispose() 및 EnemyManager.clearLingeringHazards()(방 전환마다 호출, _clearAll 포함)에서 공용 호출. */
  disposeHazards() {
    this._webs.forEach(w => { if (w.gfx?.active) w.gfx.destroy(); });
    this._webs = [];
    this.scene.enemyManager?.unregisterLingeringHazard?.(this);
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _playerOnWeb(player) {
    for (const w of this._webs) {
      const dx = player.x - w.x;
      const dy = player.y - w.y;
      if (dx * dx + dy * dy < WEB_RADIUS * WEB_RADIUS) return true;
    }
    return false;
  }

  _chasePlayer(dx, dy, dist) {
    const len = dist > 0 ? dist : 1;
    const vx = (dx / len) * KITE_SPEED * this.speedMult;
    const vy = (dy / len) * KITE_SPEED * this.speedMult;
    this.gameObject.body.setVelocity(vx, vy);
  }

  _updateReposition(dx, dy, dist, dt) {
    const len = dist > 0 ? dist : 1;
    // 측면 이동 — 너무 가까우면 후퇴 성분 추가
    const perpX = (-dy / len) * this._lateralSign;
    const perpY = (dx  / len) * this._lateralSign;
    let vx = perpX * KITE_SPEED * this.speedMult;
    let vy = perpY * KITE_SPEED * this.speedMult;
    if (dist < 80) {
      vx += (-dx / len) * KITE_SPEED * 0.5 * this.speedMult;
      vy += (-dy / len) * KITE_SPEED * 0.5 * this.speedMult;
    }
    this.gameObject.body.setVelocity(vx, vy);

    this._lateralFlip -= dt;
    if (this._lateralFlip <= 0) {
      this._lateralSign *= -1;
      this._lateralFlip  = LATERAL_FLIP;
    }
  }

  _throwWeb(dx, dy, dist, player) {
    // 플레이어 현 위치 + 약간 진행 방향 앞쪽 (속도 기준)
    const pvx = player.gameObject?.body?.velocity.x ?? 0;
    const pvy = player.gameObject?.body?.velocity.y ?? 0;
    const wx = player.x + pvx * 0.15;
    const wy = player.y + pvy * 0.15;

    this._addWeb(wx, wy);

    // 엘리트는 거미줄을 2개씩 생성 — 진행 방향에 수직으로 벌려 차단 범위를 넓힌다
    if (this.isElite) {
      const speed = Math.sqrt(pvx * pvx + pvy * pvy);
      let ox = WEB_ELITE_OFFSET, oy = 0;
      if (speed > 1) {
        ox = (-pvy / speed) * WEB_ELITE_OFFSET;
        oy = ( pvx / speed) * WEB_ELITE_OFFSET;
      }
      this._addWeb(wx + ox, wy + oy);
    }
  }

  _addWeb(wx, wy) {
    const gfx = this.scene.add.image(wx, wy, 'spider-web')
      .setDisplaySize(WEB_IMG_SIZE, WEB_IMG_SIZE)
      .setDepth(7);

    this._webs.push({ gfx, timer: WEB_DUR, x: wx, y: wy });
    const max = this.isElite ? WEB_MAX_ELITE : WEB_MAX;
    while (this._webs.length > max) {
      const old = this._webs.shift();
      if (old.gfx?.active) old.gfx.destroy();
    }
  }

  _tickWebs(dt, player) {
    this._webs = this._webs.filter(w => {
      w.timer -= dt;
      if (w.timer <= 0) {
        if (w.gfx?.active) w.gfx.destroy();
        return false;
      }
      // 페이드아웃 (마지막 0.8초)
      if (w.timer < 0.8 && w.gfx?.active) {
        w.gfx.setAlpha(w.timer / 0.8);
      }
      // 플레이어 overlap → slow 적용
      const dx = player.x - w.x;
      const dy = player.y - w.y;
      if (dx * dx + dy * dy < WEB_RADIUS * WEB_RADIUS) {
        if (player.applySlow) player.applySlow(0.15);
      }
      return true;
    });
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    let key;
    if (this._throwFlash > 0) {
      key = 'spider-throw';
    } else if (this.state === 'idle') {
      key = 'spider-idle';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `spider-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(SPIDER_DW, SPIDER_DH);
      this._applyBodySize();
      this.gameObject.setTint(TINT);
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(SPIDER_W / sx, SPIDER_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 22, SPIDER_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - SPIDER_DW / 2, y - 22, SPIDER_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 22);
    this._hpFill.setPosition(x - SPIDER_DW / 2, y - 22);
    this._hpFill.width = SPIDER_DW * Math.max(0, this.hp / this.maxHp);
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
        // EnemyManager 에서 제거된 이후에도 남은 거미줄은 매니저가 _lingeringHazards 로 직접
        // 틱한다(tickLingering). 방 전환 시 clearLingeringHazards 로 일괄 정리.
        if (this._webs.length > 0) {
          this.scene.enemyManager?.registerLingeringHazard?.(this);
        }
      },
    });
  }
}
