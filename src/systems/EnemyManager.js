import Phaser from 'phaser';
import Fox from '../entities/Fox';
import Core from '../entities/Core';
import { ROOM_W, ROOM_H, WALL_T } from '../world/Room';

const CORE_PICKUP_R          = 65;
const CORE_MAGNET_SPEED      = 400;
const FOX_KNOCKBACK_PER_DMG  = 12;
const FOX_KNOCKBACK_DUR      = 0.22;
const PLAYER_KNOCKBACK_FORCE = 220;
const PLAYER_KNOCKBACK_DUR   = 0.18;

export default class EnemyManager {
  constructor(scene, player) {
    this.scene  = scene;
    this.player = player;

    this.foxes     = [];
    this.cores     = [];
    this.coreCount = 50;

    this._hadEnemies = false;

    this.foxGroup = scene.physics.add.group();
    scene.physics.add.collider(this.foxGroup, this.foxGroup);
    scene.events.on('attack-fired', this._onAttackFired, this);
  }

  // ── public ──────────────────────────────────────────

  update(delta) {
    this.foxes.forEach(fox => fox.update(delta, this.player));

    // 접촉 데미지 — 거리 직접 계산 + 넉백
    this.foxes.forEach(fox => {
      if (!fox.alive || fox.attackCooldown > 0 || fox.state === 'stun') return;
      const dx = this.player.x - fox.x;
      const dy = this.player.y - fox.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < 26) {
        fox.attackCooldown = 1;
        const nx   = d > 0 ? dx / d : 0;
        const ny   = d > 0 ? dy / d : 0;
        const dead = this.player.takeDamage(fox.damage, {
          dx: nx, dy: ny,
          force: PLAYER_KNOCKBACK_FORCE,
          duration: PLAYER_KNOCKBACK_DUR,
        });
        if (dead) this.scene.events.emit('player-dead');
      }
    });

    const prevLen = this.foxes.length;
    this.foxes = this.foxes.filter(fox => !fox.destroyed);

    // 마지막 적 처치 시 — 남은 코어 전부 흡수 후 이벤트 발행
    if (this._hadEnemies && prevLen > 0 && this.foxes.length === 0) {
      this._hadEnemies = false;
      this._collectAllCores();
      this.scene.events.emit('all-enemies-dead');
    }

    const dt = delta / 1000;
    this.cores = this.cores.filter(core => {
      if (!core.alive) return false;
      const dx = this.player.x - core.x;
      const dy = this.player.y - core.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (core.magnetized || d < CORE_PICKUP_R) {
        if (!core.magnetized) core.startMagnet();
        if (d < 12) { core.collect(); this.coreCount++; return false; }
        core.gameObject.x += (dx / d) * CORE_MAGNET_SPEED * dt;
        core.gameObject.y += (dy / d) * CORE_MAGNET_SPEED * dt;
        return true;
      }
      return true;
    });
  }

  /** 방 전환 시 호출: 기존 적·아이템 즉시 정리 후 새 방에 스폰 */
  spawnForRoom(count) {
    this._clearAll();
    this._hadEnemies = count > 0;

    const pad = WALL_T + 55;
    for (let i = 0; i < count; i++) {
      const x = pad + Math.random() * (ROOM_W - pad * 2);
      const y = pad + Math.random() * (ROOM_H - pad * 2);
      this.spawnFox(x, y);
    }
  }

  spawnFox(x, y) {
    const fox = new Fox(this.scene, x, y);
    this.foxes.push(fox);
    this.foxGroup.add(fox.gameObject);
    return fox;
  }

  destroy() {
    this.scene.events.off('attack-fired', this._onAttackFired, this);
  }

  // ── private ─────────────────────────────────────────

  _collectAllCores() {
    this.cores.forEach(core => {
      if (core.alive) core.startMagnet();
    });
    // 실제 수집은 update() 루프의 자석 로직이 처리
  }

  _clearAll() {
    this.foxes.forEach(fox => { if (!fox.destroyed) fox.dispose(); });
    this.foxes = [];
    this.cores.forEach(core => { if (core.alive) { core.alive = false; core.gameObject.destroy(); } });
    this.cores = [];
  }

  _onAttackFired({ tierData, playerX, playerY, aimDir }) {
    this.foxes.forEach(fox => {
      if (!fox.alive || fox.state === 'stun') return;
      const hit = tierData.shape === 'circle'
        ? Phaser.Math.Distance.Between(playerX, playerY, fox.x, fox.y) <= tierData.radius
        : this._inOrientedRect(fox.x, fox.y, playerX, playerY, aimDir, tierData.length, tierData.width / 2);
      if (!hit) return;
      const ddx = fox.x - playerX;
      const ddy = fox.y - playerY;
      const len = Math.sqrt(ddx * ddx + ddy * ddy);
      const nx  = len > 0 ? ddx / len : aimDir.x;
      const ny  = len > 0 ? ddy / len : aimDir.y;
      const dead = fox.takeDamage(tierData.damage, {
        dx: nx, dy: ny,
        force: tierData.damage * FOX_KNOCKBACK_PER_DMG,
        duration: FOX_KNOCKBACK_DUR,
      });
      if (dead) this.dropCores(fox.x, fox.y, 3);
    });
  }

  _inOrientedRect(px, py, ox, oy, { x: dx, y: dy }, length, halfW) {
    const relX  = px - ox, relY  = py - oy;
    const along = relX * dx   + relY * dy;
    const perp  = relX * (-dy) + relY * dx;
    return along >= 0 && along <= length && Math.abs(perp) <= halfW;
  }

  dropCores(x, y, count) {
    for (let i = 0; i < count; i++) this.cores.push(new Core(this.scene, x, y));
  }
}
