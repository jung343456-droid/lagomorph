import Phaser from 'phaser';
import Fox from '../entities/Fox';
import Core from '../entities/Core';
import { ROOM_W, ROOM_H, WALL_T } from '../world/Room';

const CORE_PICKUP_R = 24;

export default class EnemyManager {
  constructor(scene, player) {
    this.scene  = scene;
    this.player = player;

    this.foxes     = [];
    this.cores     = [];
    this.coreCount = 0;

    this._hadEnemies = false;

    this.foxGroup = scene.physics.add.group();
    scene.physics.add.collider(this.foxGroup, this.foxGroup);
    scene.physics.add.overlap(this.foxGroup, player.gameObject, this._onContactDamage, null, this);
    scene.events.on('attack-fired', this._onAttackFired, this);
  }

  // ── public ──────────────────────────────────────────

  update(delta) {
    this.foxes.forEach(fox => fox.update(delta, this.player));

    const prevLen = this.foxes.length;
    this.foxes = this.foxes.filter(fox => !fox.destroyed);

    // 마지막 적 처치 시 이벤트 발행
    if (this._hadEnemies && prevLen > 0 && this.foxes.length === 0) {
      this._hadEnemies = false;
      this.scene.events.emit('all-enemies-dead');
    }

    this.cores = this.cores.filter(core => {
      if (!core.alive) return false;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, core.x, core.y);
      if (d < CORE_PICKUP_R) { core.collect(); this.coreCount++; return false; }
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

  _clearAll() {
    this.foxes.forEach(fox => { if (!fox.destroyed) fox.dispose(); });
    this.foxes = [];
    this.cores.forEach(core => { if (core.alive) { core.alive = false; core.gameObject.destroy(); } });
    this.cores = [];
  }

  _onContactDamage(foxGO, _playerGO) {
    const fox = this.foxes.find(f => f.gameObject === foxGO);
    if (!fox || !fox.alive || fox.attackCooldown > 0 || fox.state === 'stun') return;
    fox.attackCooldown = 1;
    const dead = this.player.takeDamage(fox.damage);
    if (dead) this.scene.events.emit('player-dead');
  }

  _onAttackFired({ tierData, playerX, playerY, aimDir }) {
    this.foxes.forEach(fox => {
      if (!fox.alive || fox.state === 'stun') return;
      const hit = tierData.shape === 'circle'
        ? Phaser.Math.Distance.Between(playerX, playerY, fox.x, fox.y) <= tierData.radius
        : this._inOrientedRect(fox.x, fox.y, playerX, playerY, aimDir, tierData.length, tierData.width / 2);
      if (!hit) return;
      const dead = fox.takeDamage(tierData.damage);
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
