import Phaser from 'phaser';
import Fox      from '../entities/Fox';
import Rat      from '../entities/Rat';
import Weasel   from '../entities/Weasel';
import Hedgehog from '../entities/Hedgehog';
import Squirrel from '../entities/Squirrel';
import Core from '../entities/Core';
import { ROOM_W, ROOM_H, WALL_T } from '../world/Room';

const CORE_PICKUP_R          = 65;  // 코어 자동 흡수 시작 반경 (px)
const CORE_MAGNET_SPEED      = 400; // 코어 자석 이동 속도 (px/s)
const KNOCKBACK_PER_DMG      = 12;  // 근거리 공격 넉백 강도 = 데미지 × 이 값
const KNOCKBACK_DUR          = 0.22; // 적 넉백 지속 시간 (초)
const PLAYER_KNOCKBACK_FORCE = 220; // 적 접촉 시 플레이어 넉백 강도
const PLAYER_KNOCKBACK_DUR   = 0.18; // 적 접촉 시 플레이어 넉백 지속 시간 (초)

const ENEMY_CLASSES = { fox: Fox, rat: Rat, weasel: Weasel, hedgehog: Hedgehog, squirrel: Squirrel };

const SPAWN_TABLE = [
  { type: 'fox',      weight: 3 },
  { type: 'rat',      weight: 2 },
  { type: 'weasel',   weight: 2 },
  { type: 'hedgehog', weight: 1 },
  { type: 'squirrel', weight: 1 },
];
const SPAWN_TOTAL = SPAWN_TABLE.reduce((s, e) => s + e.weight, 0);

export default class EnemyManager {
  constructor(scene, player) {
    this.scene  = scene;
    this.player = player;

    this.enemies    = [];
    this.cores      = [];
    this.coreCount  = 50;

    this._hadEnemies = false;

    this.enemyGroup  = scene.physics.add.group();
    this._enemyProjs = [];  // 수동 이동 투사체 { go, damage, vx, vy }

    scene.physics.add.collider(this.enemyGroup, this.enemyGroup);
    scene.events.on('attack-fired', this._onAttackFired, this);
  }

  // ── public ──────────────────────────────────────────

  update(delta) {
    const dt = delta / 1000;
    this.enemies.forEach(e => e.update(delta, this.player));

    // 접촉 데미지 (플레이어 ← 모든 적)
    this.enemies.forEach(e => {
      if (!e.alive || e.attackCooldown > 0 || e.state === 'stun') return;
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < 26) {
        e.attackCooldown = 1;
        const nx   = d > 0 ? dx / d : 0;
        const ny   = d > 0 ? dy / d : 0;
        const dead = this.player.takeDamage(e.damage, {
          dx: nx, dy: ny,
          force:    PLAYER_KNOCKBACK_FORCE,
          duration: PLAYER_KNOCKBACK_DUR,
        });
        if (dead) this.scene.events.emit('player-dead');
      }
    });

    // 적 투사체 — 수동 이동 + 피격 판정
    this._enemyProjs = this._enemyProjs.filter(proj => {
      if (!proj.go.active) return false;
      proj.go.x += proj.vx * dt;
      proj.go.y += proj.vy * dt;
      const { x, y } = proj.go;
      // 벽 경계 도달 시 소멸
      if (x < WALL_T || x > ROOM_W - WALL_T || y < WALL_T || y > ROOM_H - WALL_T) {
        proj.go.destroy();
        return false;
      }
      // 플레이어 피격
      const pdx = this.player.x - x;
      const pdy = this.player.y - y;
      const pd  = Math.sqrt(pdx * pdx + pdy * pdy);
      if (pd < 22) {
        const dead = this.player.takeDamage(proj.damage, {
          dx: pd > 0 ? pdx / pd : 0,
          dy: pd > 0 ? pdy / pd : 0,
          force:    PLAYER_KNOCKBACK_FORCE,
          duration: PLAYER_KNOCKBACK_DUR,
        });
        if (dead) this.scene.events.emit('player-dead');
        proj.go.destroy();
        return false;
      }
      return true;
    });

    const prevLen = this.enemies.length;
    this.enemies = this.enemies.filter(e => !e.destroyed);

    // 마지막 적 처치 → 코어 흡수 + 방 클리어
    if (this._hadEnemies && prevLen > 0 && this.enemies.length === 0) {
      this._hadEnemies = false;
      this._collectAllCores();
      this.scene.events.emit('all-enemies-dead');
    }

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

  /** 방 전환 시 호출: 기존 적·아이템 정리 후 새 방에 스폰 */
  spawnForRoom(count) {
    this._clearAll();
    this._hadEnemies = count > 0;

    const pad = WALL_T + 55;
    for (let i = 0; i < count; i++) {
      const x    = pad + Math.random() * (ROOM_W - pad * 2);
      const y    = pad + Math.random() * (ROOM_H - pad * 2);
      const type = this._pickType();
      if (type === 'rat') {
        // 3마리 묶음 스폰
        for (let j = 0; j < 3; j++) {
          const angle = (j / 3) * Math.PI * 2;
          this.spawnEnemy('rat', x + Math.cos(angle) * 18, y + Math.sin(angle) * 18);
        }
      } else {
        this.spawnEnemy(type, x, y);
      }
    }
  }

  spawnEnemy(type, x, y) {
    const Cls   = ENEMY_CLASSES[type] ?? Fox;
    const enemy = new Cls(this.scene, x, y);
    this.enemies.push(enemy);
    this.enemyGroup.add(enemy.gameObject);
    return enemy;
  }

  /** 다람쥐 투사체 등록 (Squirrel에서 호출) */
  addEnemyProjectile(go, damage, vx, vy) {
    this._enemyProjs.push({ go, damage, vx, vy });
  }

  destroy() {
    this.scene.events.off('attack-fired', this._onAttackFired, this);
  }

  // ── private ─────────────────────────────────────────

  _pickType() {
    let r = Math.random() * SPAWN_TOTAL;
    for (const entry of SPAWN_TABLE) {
      r -= entry.weight;
      if (r <= 0) return entry.type;
    }
    return SPAWN_TABLE[SPAWN_TABLE.length - 1].type;
  }

  _collectAllCores() {
    this.cores.forEach(core => { if (core.alive) core.startMagnet(); });
  }

  _clearAll() {
    this.enemies.forEach(e => { if (!e.destroyed) e.dispose(); });
    this.enemies = [];
    this.cores.forEach(core => {
      if (core.alive) { core.alive = false; core.gameObject.destroy(); }
    });
    this.cores = [];
    this._enemyProjs.forEach(p => { if (p.go.active) p.go.destroy(); });
    this._enemyProjs = [];
  }

  _onAttackFired({ tierData, playerX, playerY, aimDir }) {
    this.enemies.forEach(e => {
      if (!e.alive || e.state === 'stun') return;
      const hit = tierData.shape === 'circle'
        ? Phaser.Math.Distance.Between(playerX, playerY, e.x, e.y) <= tierData.radius
        : this._inOrientedRect(e.x, e.y, playerX, playerY, aimDir, tierData.length, tierData.width / 2);
      if (!hit) return;
      const ddx = e.x - playerX;
      const ddy = e.y - playerY;
      const len = Math.sqrt(ddx * ddx + ddy * ddy);
      const nx  = len > 0 ? ddx / len : aimDir.x;
      const ny  = len > 0 ? ddy / len : aimDir.y;
      const dead = e.takeDamage(tierData.damage, {
        dx: nx, dy: ny,
        force:    tierData.damage * KNOCKBACK_PER_DMG,
        duration: KNOCKBACK_DUR,
      });
      if (dead) this.dropCores(e.x, e.y, e.coreDrops ?? 3);
    });
  }

  _inOrientedRect(px, py, ox, oy, { x: dx, y: dy }, length, halfW) {
    const relX  = px - ox, relY  = py - oy;
    const along = relX * dx    + relY * dy;
    const perp  = relX * (-dy) + relY * dx;
    return along >= 0 && along <= length && Math.abs(perp) <= halfW;
  }

  dropCores(x, y, count) {
    for (let i = 0; i < count; i++) this.cores.push(new Core(this.scene, x, y));
  }
}
