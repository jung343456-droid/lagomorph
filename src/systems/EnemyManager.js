import Phaser from 'phaser';
import Fox      from '../entities/Fox';
import Rat      from '../entities/Rat';
import Weasel   from '../entities/Weasel';
import Hedgehog from '../entities/Hedgehog';
import Squirrel from '../entities/Squirrel';
import Fang     from '../entities/Fang';
import Wolf     from '../entities/Wolf';
import Bat      from '../entities/Bat';
import Boar     from '../entities/Boar';
import Spider   from '../entities/Spider';
import Bear     from '../entities/Bear';
import Toad     from '../entities/Toad';
import BlackBear from '../entities/BlackBear';
import OwlKing  from '../entities/OwlKing';
import Core     from '../entities/Core';
import RareItem, { PICKUP_R as RARE_PICKUP_R, MAGNET_SPEED as RARE_MAGNET_SPEED, COLLECT_R as RARE_COLLECT_R } from '../entities/RareItem';
import { ROOM_W, ROOM_H, WALL_T } from '../world/Room';
import { showDamageNumber } from '../utils/DamageNumbers';
import { addRunPickup } from '../data/MetaProgress';
import { altarCostFor } from '../data/AltarPool';

const CORE_PICKUP_R          = 55;  // 코어 자동 흡수 시작 반경 기본값 (px) — 해금으로 player.corePickupRange 증가
const CORE_MAGNET_SPEED      = 400; // 코어 자석 이동 속도 (px/s)
const KNOCKBACK_PER_DMG      = 12;  // 근거리 공격 넉백 강도 = 데미지 × 이 값
const KNOCKBACK_DUR          = 0.22; // 적 넉백 지속 시간 (초)
const PLAYER_KNOCKBACK_FORCE = 220; // 적 접촉 시 플레이어 넉백 강도
const PLAYER_KNOCKBACK_DUR   = 0.18; // 적 접촉 시 플레이어 넉백 지속 시간 (초)
const PLAYER_AVG_HALF        = 23;  // 플레이어 히트박스 평균 반경 (BODY_W=48, BODY_H=46 → (24+23)/2)
const ELITE_CHANCE           = 0.01; // 방당 엘리트 등장 확률 (1%)
const ELITE_TINT_COLOR       = 0xffaaaa; // 엘리트 스프라이트 틴트 (붉은 계열)
const ELITE_HP_MULT          = 4;    // 엘리트 최대 HP ×4
const ELITE_DMG_MULT         = 2;    // 엘리트 공격력 ×2
const ELITE_SPD_MULT         = 2;    // 엘리트 이동속도 ×2 (speedMult/baseSpeedMult 경유 — 모든 적 이동이 곱함)
const MIN_SPAWN_DIST         = 160;      // 플레이어 진입 위치와 적 스폰 최소 거리 (px)

// 구역 2(층 11~20) 강화 배수 — 1구역 기준 적 스탯 대비. 보스 포함 모든 스폰에 적용.
// (ZONE34_* 네이밍은 구버전 4구역 잔재 — 실제 조건은 floorNum >= 11)
const ZONE34_FLOOR     = 11;  // 이 층 이상에서 강화 적용
const ZONE34_HP_MULT   = 1.4; // HP ×1.4
const ZONE34_DMG_MULT  = 1.4; // 공격력 ×1.4
const ZONE34_SPD_MULT  = 1.1; // 이동속도 ×1.1 (speedMult / baseSpeedMult 경유)
const ZONE34_CORE_MULT = 1.5; // 코어 드롭 ×1.5 (적이 더 단단해진 만큼 보상 상향)

const ENEMY_CLASSES = {
  // 구역 1
  fox: Fox, rat: Rat, weasel: Weasel, hedgehog: Hedgehog, squirrel: Squirrel,
  // 구역 2
  bat: Bat, boar: Boar, spider: Spider, bear: Bear, toad: Toad,
};

// 보스 클래스 — 임시 저장 복원용 타입 매핑에 포함 (스폰 테이블엔 들어가지 않음)
const BOSS_CLASSES = { fang: Fang, wolf: Wolf, blackbear: BlackBear, owlking: OwlKing };

// 복원 시 사용하는 type↔Class 양방향 매핑 (일반 적 + 보스 전부 포함)
const ALL_CLASSES   = { ...ENEMY_CLASSES, ...BOSS_CLASSES };
const CLASS_TO_TYPE = new Map(Object.entries(ALL_CLASSES).map(([type, Cls]) => [Cls, type]));

// 적 스칼라 스냅샷에서 제외할 키 — Phaser 객체/HP바/타이머 참조 (순환참조 방지)
const SNAPSHOT_SKIP = new Set(['scene', 'gameObject', '_hpBg', '_hpFill', '_blinkEvent', '_eliteCleanup']);

// 층별 스폰 풀 — 층이 내려갈수록 적 종류가 점진적으로 추가됨.
//   1~5: 구역 1 (풀숲) / 6~10: 구역 2 (더 깊은 숲)
const FLOOR_SPAWN_TABLES = {
  1: [
    { type: 'rat',      weight: 3 },
    { type: 'weasel',   weight: 2 },
  ],
  2: [
    { type: 'rat',      weight: 3 },
    { type: 'weasel',   weight: 2 },
    { type: 'fox',      weight: 2 },
  ],
  3: [
    { type: 'rat',      weight: 2 },
    { type: 'weasel',   weight: 2 },
    { type: 'fox',      weight: 2 },
    { type: 'squirrel', weight: 2 },
  ],
  4: [
    { type: 'rat',      weight: 2 },
    { type: 'weasel',   weight: 2 },
    { type: 'fox',      weight: 2 },
    { type: 'squirrel', weight: 2 },
    { type: 'hedgehog', weight: 1 },
  ],
  5: [
    { type: 'rat',      weight: 1 },
    { type: 'weasel',   weight: 2 },
    { type: 'fox',      weight: 2 },
    { type: 'squirrel', weight: 2 },
    { type: 'hedgehog', weight: 2 },
  ],
  6: [
    { type: 'bat',      weight: 3 },
    { type: 'boar',     weight: 2 },
  ],
  7: [
    { type: 'bat',      weight: 3 },
    { type: 'boar',     weight: 2 },
    { type: 'spider',   weight: 2 },
  ],
  8: [
    { type: 'bat',      weight: 2 },
    { type: 'boar',     weight: 2 },
    { type: 'spider',   weight: 2 },
    { type: 'toad',     weight: 2 },
  ],
  9: [
    { type: 'bat',      weight: 2 },
    { type: 'boar',     weight: 2 },
    { type: 'spider',   weight: 2 },
    { type: 'toad',     weight: 2 },
    { type: 'bear',     weight: 1 },
  ],
  10: [
    { type: 'bat',      weight: 1 },
    { type: 'boar',     weight: 2 },
    { type: 'spider',   weight: 2 },
    { type: 'toad',     weight: 2 },
    { type: 'bear',     weight: 2 },
  ],
};

// 구역 2(층 11~20) 혼합 풀 — 구역 1 적 10종을 랜덤 배치. 모든 층 동일 풀 재사용.
const MIXED_POOL = [
  { type: 'rat',      weight: 2 },
  { type: 'weasel',   weight: 2 },
  { type: 'fox',      weight: 2 },
  { type: 'squirrel', weight: 2 },
  { type: 'hedgehog', weight: 1 },
  { type: 'bat',      weight: 2 },
  { type: 'boar',     weight: 2 },
  { type: 'spider',   weight: 2 },
  { type: 'toad',     weight: 2 },
  { type: 'bear',     weight: 1 },
];
for (let f = 11; f <= 20; f++) FLOOR_SPAWN_TABLES[f] = MIXED_POOL;

// 3마리 묶음 스폰되는 타입 — Rat(들쥐), Bat(박쥐)
const PACK_TYPES = new Set(['rat', 'bat']);

export default class EnemyManager {
  constructor(scene, player) {
    this.scene  = scene;
    this.player = player;

    this.enemies    = [];
    this.cores      = [];
    this.rareItems  = [];
    this.coreCount  = 30;
    this._altarPurchases = 0; // 코어 제단 런 누적 구매 수 — 가격 누진 기준 (AltarPool.altarCostFor)
    this.boss       = null; // 현재 보스 참조 (UIScene에서 HP 표시용)
    this.floorNum   = 1;    // 현재 층 — _pickType()이 참조하는 스폰 풀 키

    this._hadEnemies = false;
    this._poisoned   = new Map(); // Map<enemy, { timer, accum }>
    this._burned     = new Map(); // Map<enemy, { timer, accum }>
    this._frozen     = new Map(); // Map<enemy, { timer }>

    this.enemyGroup  = scene.physics.add.group();
    this._enemyProjs = [];  // 수동 이동 투사체 { go, damage, vx, vy }
    // 적 사망 후에도 scene update 로 남아 틱하는 지속형 위험물(거미줄·독 웅덩이) 소유자 집합.
    // 사망 시 this.enemies 에서 빠지므로 별도 추적해야 방 전환(_clearAll) 때 정리된다.
    this._lingeringHazards = new Set();

    scene.physics.add.collider(this.enemyGroup, this.enemyGroup);
    scene.events.on('attack-fired', this._onAttackFired, this);
  }

  // ── public ──────────────────────────────────────────

  update(delta) {
    const dt = delta / 1000;
    this.enemies.forEach(e => e.update(delta, this.player));

    // 적 위치 안전 클램프 — 강한 넉백이 lockDoors 블록을 뚫고 벽 너머로 빠지는 사례 차단.
    //   문 잠금이 풀린 클리어방에서는 적이 존재하지 않으므로 항상 안전.
    //   클램프된 축의 외향 속도는 0으로 끊어 매 프레임 다시 벽을 향해 튕기는 루프 방지.
    this.enemies.forEach(e => {
      if (!e.alive) return;
      const go   = e.gameObject;
      const body = go?.body;
      if (!body) return;
      const hw = body.halfWidth;
      const hh = body.halfHeight;
      const minX = WALL_T + hw;
      const maxX = ROOM_W - WALL_T - hw;
      const minY = WALL_T + hh;
      const maxY = ROOM_H - WALL_T - hh;
      let cx = go.x, cy = go.y, clamped = false;
      if      (cx < minX) { cx = minX; clamped = true; if (body.velocity.x < 0) body.setVelocityX(0); }
      else if (cx > maxX) { cx = maxX; clamped = true; if (body.velocity.x > 0) body.setVelocityX(0); }
      if      (cy < minY) { cy = minY; clamped = true; if (body.velocity.y < 0) body.setVelocityY(0); }
      else if (cy > maxY) { cy = maxY; clamped = true; if (body.velocity.y > 0) body.setVelocityY(0); }
      if (clamped) go.setPosition(cx, cy);
    });

    // 접촉 데미지 (플레이어 ← 모든 적)
    this.enemies.forEach(e => {
      if (!e.alive || e.attackCooldown > 0 || e.state === 'stun') return;
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      const contactR = (e.gameObject.body.halfWidth + e.gameObject.body.halfHeight) / 2 + PLAYER_AVG_HALF;
      if (d < contactR) {
        e.attackCooldown = 1;
        const nx   = d > 0 ? dx / d : 0;
        const ny   = d > 0 ? dy / d : 0;
        // 사망 시 결과창에서 표시할 가해자 이름 — takeDamage 결과가 무적이라 false 반환이어도 마지막 접촉자로 기록
        this.player.lastDamageSource = e.displayName ?? '적';
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
      if (pd < 20) {
        this.player.lastDamageSource = proj.displayName ?? '적 투사체';
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

    // 독 데미지 틱 — 1초마다 정수 데미지 한 번 (max(2, floor(maxHp×1%))). 0.5초 단위 1피해 누적 방식 폐기.
    for (const [enemy, entry] of this._poisoned) {
      if (!enemy.alive) { this._poisoned.delete(enemy); continue; }
      entry.timer -= dt;
      if (entry.timer <= 0) {
        this._poisoned.delete(enemy);
        enemy._hpFill?.setFillStyle(0x44dd44);
        continue;
      }
      entry.tickTimer -= dt;
      if (entry.tickTimer <= 0) {
        entry.tickTimer += 1;
        const dmg = Math.max(2, Math.floor(enemy.maxHp * 0.01));
        const died = enemy.poisonHp(dmg);
        showDamageNumber(this.scene, enemy.x, enemy.y - enemy.gameObject.height / 2, dmg, '#cc88ff');
        if (died) {
          this._poisoned.delete(enemy);
          this.dropCores(enemy.x, enemy.y, enemy.coreDrops ?? 3, enemy.isFinalBoss);
          if (enemy.isBoss) { this.dropRareItem(enemy.x, enemy.y); this.boss = null; }
          this.dropEliteItem(enemy);
          if (this.player.healOnKill > 0) this.player.heal(this.player.healOnKill);
        }
      }
    }

    // 화상 데미지 틱 — 1초마다 정수 데미지 (max(4, floor(maxHp×2.5%))). 3초 지속 → 3틱.
    for (const [enemy, entry] of this._burned) {
      if (!enemy.alive) { this._burned.delete(enemy); continue; }
      entry.timer -= dt;
      if (entry.timer <= 0) {
        this._burned.delete(enemy);
        enemy._hpFill?.setFillStyle(0x44dd44);
        continue;
      }
      entry.tickTimer -= dt;
      if (entry.tickTimer <= 0) {
        entry.tickTimer += 1;
        const dmg = Math.max(4, Math.floor(enemy.maxHp * 0.025));
        const died = enemy.poisonHp(dmg);
        showDamageNumber(this.scene, enemy.x, enemy.y - enemy.gameObject.height / 2, dmg, '#ff6622');
        if (died) {
          this._burned.delete(enemy);
          this.dropCores(enemy.x, enemy.y, enemy.coreDrops ?? 3, enemy.isFinalBoss);
          if (enemy.isBoss) { this.dropRareItem(enemy.x, enemy.y); this.boss = null; }
          this.dropEliteItem(enemy);
          if (this.player.healOnKill > 0) this.player.heal(this.player.healOnKill);
        }
      }
    }

    // 빙결 이동 제한 (3초간 속도 강제 0)
    for (const [enemy, entry] of this._frozen) {
      if (!enemy.alive) { this._frozen.delete(enemy); continue; }
      entry.timer -= dt;
      if (entry.timer <= 0) {
        this._frozen.delete(enemy);
        enemy._hpFill?.setFillStyle(0x44dd44);
        continue;
      }
      enemy.gameObject.body?.setVelocity(0, 0);
    }

    const prevLen = this.enemies.length;
    this.enemies = this.enemies.filter(e => !e.destroyed);

    // 마지막 적 처치 → 코어 흡수 + 방 클리어
    if (this._hadEnemies && prevLen > 0 && this.enemies.length === 0) {
      this._hadEnemies = false;
      // 방 클리어 시 코어 전량 흡수는 기본 해제 — autoCollectCores 패시브가 있을 때만 작동.
      // 평소엔 코어가 바닥에 남아 플레이어가 직접 근처로 가야 수집된다(CORE_PICKUP_R).
      if (this.player?.autoCollectCores) this._collectAllCores();
      this.scene.events.emit('all-enemies-dead');
    }

    const pickupR = this.player?.corePickupRange ?? CORE_PICKUP_R;
    this.cores = this.cores.filter(core => {
      if (!core.alive) return false;
      const dx = this.player.x - core.x;
      const dy = this.player.y - core.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (core.magnetized || d < pickupR) {
        if (!core.magnetized) core.startMagnet();
        if (d < 12) {
          core.collect();
          this.coreCount++;
          // 픽업한 코어는 런 종료 정산용 카운터에만 +1 (시작 시 부여된 30 은 제외)
          // 사망 시 보존율, 클리어 시 전량 적립 — commitMetaRun() 참조
          addRunPickup(1);
          return false;
        }
        core.gameObject.x += (dx / d) * CORE_MAGNET_SPEED * dt;
        core.gameObject.y += (dy / d) * CORE_MAGNET_SPEED * dt;
        return true;
      }
      return true;
    });

    // 레어 아이템 픽업
    this.rareItems = this.rareItems.filter(item => {
      if (!item.alive) return false;
      const dx = this.player.x - item.x;
      const dy = this.player.y - item.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (item.magnetized || d < RARE_PICKUP_R) {
        if (!item.magnetized) item.startMagnet();
        if (d < RARE_COLLECT_R) {
          // 대식가(big_trap) — healItemMult 로 회복량 ×1.1
          this.player.heal(Math.max(1, Math.round(item.healAmount * this.player.healItemMult)));
          item.collect();
          return false;
        }
        item.gameObject.x += (dx / d) * RARE_MAGNET_SPEED * dt;
        item.gameObject.y += (dy / d) * RARE_MAGNET_SPEED * dt;
        return true;
      }
      return true;
    });
  }

  /** 방 전환 시 호출: 기존 적·아이템 정리 후 새 방에 스폰.
   *  일반 방은 1~3종 랜덤 서브셋, isExit=true면 항상 3종(또는 풀 전체) 사용. */
  spawnForRoom(count, isExit = false) {
    this._clearAll();
    this._hadEnemies = count > 0;

    const roomTable = this._buildRoomTable(isExit);

    const pad = WALL_T + 55;
    const px  = this.player.x;
    const py  = this.player.y;
    for (let i = 0; i < count; i++) {
      let x, y;
      let tries = 0;
      do {
        x = pad + Math.random() * (ROOM_W - pad * 2);
        y = pad + Math.random() * (ROOM_H - pad * 2);
        tries++;
      } while (
        tries < 20 &&
        Math.hypot(x - px, y - py) < MIN_SPAWN_DIST
      );
      const type = this._pickType(roomTable);
      if (PACK_TYPES.has(type)) {
        // 3마리 묶음 스폰 (rat, bat)
        for (let j = 0; j < 3; j++) {
          const angle = (j / 3) * Math.PI * 2;
          this.spawnEnemy(type, x + Math.cos(angle) * 18, y + Math.sin(angle) * 18);
        }
      } else {
        this.spawnEnemy(type, x, y);
      }
    }

    // 각 적마다 1% 확률로 엘리트 — 방당 최대 1마리 제한
    for (const enemy of this.enemies) {
      if (Math.random() < ELITE_CHANCE) {
        this._makeElite(enemy);
        break;
      }
    }
  }

  spawnEnemy(type, x, y) {
    const Cls   = ENEMY_CLASSES[type] ?? Fox;
    const enemy = new Cls(this.scene, x, y);
    enemy.gameObject.body.setMaxVelocity(350, 350);
    enemy.gameObject.body.setCollideWorldBounds(true);
    if (this.floorNum >= ZONE34_FLOOR) this._applyZoneBuff(enemy);
    this.enemies.push(enemy);
    this.enemyGroup.add(enemy.gameObject);
    return enemy;
  }

  /** 중간보스방:
   *   층 3·13: Wolf 2마리 (수행원은 Wolf 자체 howl 소환)
   *   층 8·18: BlackBear 1마리 (포효 시 멧돼지 2 소환)
   *   층 13·18(구역 2)은 ZONE34 배수로 강화.
   */
  spawnMidBoss(x, y) {
    this._clearAll();
    this._hadEnemies = true;
    const buffed = this.floorNum >= ZONE34_FLOOR;
    if (this.floorNum === 8 || this.floorNum === 18) {
      const bb = new BlackBear(this.scene, x, y);
      bb.gameObject.body.setMaxVelocity(350, 350);
      bb.gameObject.body.setCollideWorldBounds(true);
      if (buffed) this._applyZoneBuff(bb);
      this.enemies.push(bb);
      this.enemyGroup.add(bb.gameObject);
      this.boss = bb;
      this.scene.events.emit('boss-spawned', bb);
    } else {
      [-70, 70].forEach(off => {
        const wolf = new Wolf(this.scene, x + off, y);
        wolf.gameObject.body.setMaxVelocity(350, 350);
        wolf.gameObject.body.setCollideWorldBounds(true);
        if (buffed) this._applyZoneBuff(wolf);
        this.enemies.push(wolf);
        this.enemyGroup.add(wolf.gameObject);
      });
    }
  }

  /** 현재 층 갱신 — _pickType()이 참조하는 풀이 바뀜 */
  setFloor(n) { this.floorNum = n; }

  /** 보스방 진입 시 호출:
   *   층 5·15 : FANG
   *   층 10·20: OWL KING
   *   층 15·20(구역 2)은 ZONE34 배수로 강화.
   */
  spawnBoss(x, y) {
    this._clearAll();
    this._hadEnemies = true;
    const BossCls = (this.floorNum === 10 || this.floorNum === 20) ? OwlKing : Fang;
    const boss = new BossCls(this.scene, x, y);
    boss.gameObject.body.setMaxVelocity(500, 500);
    boss.gameObject.body.setCollideWorldBounds(true);
    if (this.floorNum >= ZONE34_FLOOR) this._applyZoneBuff(boss);
    this.enemies.push(boss);
    this.enemyGroup.add(boss.gameObject);
    this.boss = boss;
    this.scene.events.emit('boss-spawned', boss);
    return boss;
  }

  /** 비밀 엘리트 방: 현재 층 풀에서 1마리 선택 후 엘리트 변이. 도망용 출구는 항상 열려 있음. */
  spawnSecretElite(x, y) {
    this._clearAll();
    this._hadEnemies = true;
    const table = this._buildRoomTable(false);
    const type  = this._pickType(table);
    const enemy = this.spawnEnemy(type, x, y);
    this._makeElite(enemy);
  }

  dropRareItem(x, y) {
    ({ x, y } = this.scene.roomManager?.findSafeDropPos(x, y) ?? { x, y });
    this.rareItems.push(new RareItem(this.scene, x, y));
    this.scene.events.emit('rare-item-dropped');
  }

  /** 적 투사체 등록 (예: 다람쥐 도토리). displayName 은 사망 결과창의 사인 표기용. */
  /** 사망 후 거미줄·독 웅덩이를 scene update 로 계속 틱하는 적을 등록 — 방 전환 시 일괄 정리용. */
  registerLingeringHazard(owner)   { this._lingeringHazards.add(owner); }
  unregisterLingeringHazard(owner) { this._lingeringHazards.delete(owner); }

  addEnemyProjectile(go, damage, vx, vy, displayName = '적 투사체') {
    this._enemyProjs.push({ go, damage, vx, vy, displayName });
  }

  /** 층 전환 시 모든 적·투사체·드롭 즉시 정리 */
  clearAll() { this._clearAll(); }

  /** 코어 차감 — 부족 시 false 반환 (상점·트랩 공용) */
  spendCores(n) {
    if (this.coreCount < n) return false;
    this.coreCount -= n;
    return true;
  }

  /** 코어 제단 현재 가격 — 런 누적 구매 수 기준 누진. */
  altarCost() { return altarCostFor(this._altarPurchases); }

  /** 제단 구매 1회 기록 — 이후 모든 제단 가격이 상승. */
  recordAltarPurchase() { this._altarPurchases++; }

  destroy() {
    this.scene.events.off('attack-fired', this._onAttackFired, this);
  }

  // ── 임시 저장 ─────────────────────────────────────────

  /** 현재 적·드롭·상태이상·코어 카운트를 평문 객체로 직렬화. */
  serialize() {
    const live = this.enemies.filter(e => e.alive && !e.destroyed);
    return {
      coreCount:  this.coreCount,
      altarPurchases: this._altarPurchases,
      floorNum:   this.floorNum,
      hadEnemies: this._hadEnemies,
      enemies:    live.map(e => this._snapshotEnemy(e)),
      cores:      this.cores.filter(c => c.alive).map(c => ({ x: c.x, y: c.y })),
      rareItems:  this.rareItems.filter(r => r.alive).map(r => ({ x: r.x, y: r.y })),
      status: {
        poisoned: this._serializeStatus(this._poisoned, live),
        burned:   this._serializeStatus(this._burned, live),
        frozen:   this._serializeStatus(this._frozen, live),
      },
    };
  }

  /** 저장본으로부터 적·드롭·상태이상을 재구성. (투사체는 단명하므로 복원하지 않음) */
  restoreFromSave(data) {
    if (!data) return;
    this._clearAll();
    this.coreCount = data.coreCount ?? this.coreCount;
    this._altarPurchases = data.altarPurchases ?? this._altarPurchases;
    this.floorNum  = data.floorNum ?? this.floorNum;

    for (const snap of data.enemies ?? []) this._restoreEnemy(snap);
    this._hadEnemies = this.enemies.length > 0;
    this.boss = this.enemies.find(e => e.isBoss) ?? null;

    for (const c of data.cores ?? [])     this.cores.push(new Core(this.scene, c.x, c.y));
    for (const r of data.rareItems ?? []) this.rareItems.push(new RareItem(this.scene, r.x, r.y));

    this._restoreStatus(data.status?.poisoned, this._poisoned, 0xaa44ff);
    this._restoreStatus(data.status?.burned,   this._burned,   0xff4422);
    this._restoreStatus(data.status?.frozen,   this._frozen,   0x88ccff);
  }

  /** 적 1마리의 타입 + 좌표/속도 + 스칼라 프로퍼티(평면 {x,y} 포함)를 추출. */
  _snapshotEnemy(e) {
    const props = {};
    for (const k of Object.keys(e)) {
      if (SNAPSHOT_SKIP.has(k)) continue;
      const v = e[k];
      const t = typeof v;
      if (t === 'number' || t === 'string' || t === 'boolean') {
        props[k] = v;
      } else if (v && t === 'object') {
        // facingDir 등 평면 {x,y} 만 보존 — 적 인스턴스 등 참조는 제외
        const keys = Object.keys(v);
        if (keys.length && keys.every(kk => (kk === 'x' || kk === 'y') && typeof v[kk] === 'number')) {
          props[k] = { ...v };
        }
      }
    }
    const body = e.gameObject.body;
    return {
      type: CLASS_TO_TYPE.get(e.constructor) ?? 'fox',
      x: e.gameObject.x,
      y: e.gameObject.y,
      vx: body?.velocity.x ?? 0,
      vy: body?.velocity.y ?? 0,
      props,
    };
  }

  _restoreEnemy(snap) {
    const Cls   = ALL_CLASSES[snap.type] ?? Fox;
    const isBoss = snap.type in BOSS_CLASSES;
    const enemy = new Cls(this.scene, snap.x, snap.y);
    Object.assign(enemy, snap.props);

    const body = enemy.gameObject.body;
    body.setMaxVelocity(isBoss ? 500 : 350, isBoss ? 500 : 350);
    body.setCollideWorldBounds(true);
    enemy.gameObject.setPosition(snap.x, snap.y);
    body.reset(snap.x, snap.y);
    body.setVelocity(snap.vx, snap.vy);

    if (enemy.isElite) this._applyEliteTint(enemy);

    // HP바/스프라이트는 다음 GameScene.update 프레임(~16ms)에 자동 동기화된다.
    // 여기서 update(0) 를 강제 호출하면 보스 AI 부수효과(howl 소환 등)가 즉발될 수 있어 호출하지 않는다.

    this.enemies.push(enemy);
    this.enemyGroup.add(enemy.gameObject);
    return enemy;
  }

  /** 상태이상 Map<enemy,entry> → [{ idx, ...entry }] (idx = live 배열 인덱스). */
  _serializeStatus(map, live) {
    const out = [];
    for (const [enemy, entry] of map) {
      const idx = live.indexOf(enemy);
      if (idx === -1) continue;
      out.push({ idx, ...entry });
    }
    return out;
  }

  _restoreStatus(arr, map, hpFillColor) {
    for (const s of arr ?? []) {
      const enemy = this.enemies[s.idx];
      if (!enemy) continue;
      const { idx, ...entry } = s;
      map.set(enemy, entry);
      enemy._hpFill?.setFillStyle(hpFillColor);
    }
  }

  // ── private ─────────────────────────────────────────

  _pickType(table) {
    table ??= FLOOR_SPAWN_TABLES[this.floorNum] ?? FLOOR_SPAWN_TABLES[5];
    const total = table.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const entry of table) {
      r -= entry.weight;
      if (r <= 0) return entry.type;
    }
    return table[table.length - 1].type;
  }

  /** 방 단위 적 풀: 일반 방은 1~3종 랜덤, 출구방은 항상 3종 (풀이 더 작으면 전체). */
  _buildRoomTable(isExit = false) {
    const floorTable = FLOOR_SPAWN_TABLES[this.floorNum] ?? FLOOR_SPAWN_TABLES[5];
    const target = isExit ? 3 : (1 + Math.floor(Math.random() * 3));
    const size   = Math.min(target, floorTable.length);
    // Fisher-Yates 셔플 후 앞 size개 선택
    const arr = floorTable.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, size);
  }

  _collectAllCores() {
    this.cores.forEach(core => { if (core.alive) core.startMagnet(); });
  }

  _clearAll() {
    this.enemies.forEach(e => {
      if (e._eliteCleanup) { e._eliteCleanup(); e._eliteCleanup = null; }
      if (!e.destroyed) e.dispose();
    });
    this.enemies = [];
    this.boss = null;
    this.cores.forEach(core => {
      if (core.alive) { core.alive = false; core.gameObject.destroy(); }
    });
    this.cores = [];
    this.rareItems.forEach(item => { if (item.alive) item.dispose(); });
    this.rareItems = [];
    this._enemyProjs.forEach(p => { if (p.go.active) p.go.destroy(); });
    this._enemyProjs = [];
    // 사망 후 남아 틱하던 거미줄·독 웅덩이(this.enemies 에서 이미 빠진 적)도 정리
    this._lingeringHazards.forEach(h => h.disposeHazards?.());
    this._lingeringHazards.clear();
    this._poisoned.clear();
    this._burned.clear();
    this._frozen.clear();
  }

  /** 적 1마리를 엘리트로 변환: HP 4배, 나머지 능력치 2배, 코어 드롭 5배(최소 8), 붉은 틴트로 외형 강조 */
  /** 구역 2(층 11~20) 적 강화 — 1구역 기준 대비 HP·공격력 ×1.4, 이동속도 ×1.1, 코어 드롭 ×1.5.
   *  변형값(maxHp·hp·damage·coreDrops·speedMult·baseSpeedMult·zoneBuffed)은 모두 숫자/불리언
   *  인스턴스 프로퍼티라 _snapshotEnemy/_restoreEnemy 로 자동 보존·복원된다(중복 적용 없음). */
  _applyZoneBuff(enemy) {
    enemy.maxHp  = Math.round(enemy.maxHp  * ZONE34_HP_MULT);
    enemy.hp     = enemy.maxHp;
    enemy.damage = Math.round((enemy.damage ?? 0) * ZONE34_DMG_MULT);
    if (typeof enemy.coreDrops === 'number') {
      enemy.coreDrops = Math.round(enemy.coreDrops * ZONE34_CORE_MULT);
    }
    if (typeof enemy.speedMult === 'number') {
      // baseSpeedMult: Wolf 오라가 이 값을 기준으로 곱한다(오라 밖에선 이 값으로 복귀).
      enemy.baseSpeedMult = ZONE34_SPD_MULT;
      enemy.speedMult     = ZONE34_SPD_MULT;
    } else if (typeof enemy.speed === 'number') {
      enemy.speed *= ZONE34_SPD_MULT; // speedMult 없는 보스 폴백
    }
    enemy.zoneBuffed = true;
  }

  _makeElite(enemy) {
    enemy.maxHp  = Math.round(enemy.maxHp * ELITE_HP_MULT);
    enemy.hp      = enemy.maxHp;
    enemy.damage = Math.round((enemy.damage ?? 0) * ELITE_DMG_MULT);
    // 이동속도 ×2 — 모든 적 이동이 speedMult(오라 없을 땐 baseSpeedMult)를 곱하므로
    // 이 체인에 실어 일관 적용한다. Wolf 오라는 baseSpeedMult 기준 재계산하므로 자연히 합산.
    // baseSpeedMult/speedMult 는 스냅샷 대상이라 저장/복원에서도 그대로 유지된다.
    if (typeof enemy.speedMult === 'number') {
      enemy.baseSpeedMult = (enemy.baseSpeedMult ?? 1.0) * ELITE_SPD_MULT;
      enemy.speedMult     = (enemy.speedMult ?? 1.0) * ELITE_SPD_MULT;
    } else if (typeof enemy.speed === 'number') {
      enemy.speed *= ELITE_SPD_MULT; // speedMult 없는 폴백
    }
    enemy.coreDrops = Math.max(8, (enemy.coreDrops ?? 3) * 5);
    enemy.isElite = true;
    this._applyEliteTint(enemy);
  }

  /** 엘리트 시각 효과(붉은 틴트 + clearTint 오버라이드)만 적용 — 신규 변환과 저장 복원에서 공용. */
  _applyEliteTint(enemy) {
    const go = enemy.gameObject;
    go.setTint(ELITE_TINT_COLOR);
    const origClearTint = go.clearTint.bind(go);
    go.clearTint = () => {
      origClearTint();
      if (enemy.isElite && enemy.alive) go.setTint(ELITE_TINT_COLOR);
    };

    enemy._eliteCleanup = () => {
      go.clearTint = origClearTint;
      origClearTint();
    };
  }

  _applyPoison(enemy) {
    if (this._poisoned.has(enemy)) return;
    // tickTimer 1 → 첫 데미지는 부여 후 1초 뒤 발생 (즉발 X)
    this._poisoned.set(enemy, { timer: 10, tickTimer: 1 });
    enemy._hpFill?.setFillStyle(0xaa44ff);
  }

  _applyBurn(enemy) {
    if (this._burned.has(enemy)) return;
    this._burned.set(enemy, { timer: 3, tickTimer: 1 });
    enemy._hpFill?.setFillStyle(0xff4422);
  }

  _applyFreeze(enemy) {
    if (this._frozen.has(enemy)) return;
    this._frozen.set(enemy, { timer: 3 });
    enemy._hpFill?.setFillStyle(0x88ccff);
  }

  _onAttackFired({ tierData, playerX, playerY, aimDir }) {
    const directHit = [];
    this.enemies.forEach(e => {
      if (!e.alive || e.state === 'stun') return;
      const hit = tierData.shape === 'circle'
        ? Phaser.Math.Distance.Between(playerX, playerY, e.x, e.y) <= tierData.radius
        : this._inOrientedRect(e.x, e.y, playerX, playerY, aimDir, tierData.length, tierData.width / 2);
      if (!hit) return;

      // 고슴도치 가시 상태: 무적 — 데미지/상태이상/연쇄 모두 무시, 넉백 반사만 처리
      const isSpike = e.state === 'spike';

      if (!isSpike) {
        if (this.player.hasPoison && Math.random() < 0.25) this._applyPoison(e);
        if (this.player.hasFire && Math.random() < 0.25) this._applyBurn(e);
        if (this.player.hasIce && Math.random() < 0.25) this._applyFreeze(e);
      }

      const ddx = e.x - playerX;
      const ddy = e.y - playerY;
      const len = Math.sqrt(ddx * ddx + ddy * ddy);
      const nx  = len > 0 ? ddx / len : aimDir.x;
      const ny  = len > 0 ? ddy / len : aimDir.y;
      // 치명타 굴림 — 넉백은 원본 데미지 기준으로 계산해 과한 넉백 폭주 방지
      const { damage: appliedDmg, isCrit } = this.player.rollAttackDamage(tierData.damage);
      const dead = e.takeDamage(appliedDmg, {
        dx: nx, dy: ny,
        force:    tierData.damage * KNOCKBACK_PER_DMG,
        duration: KNOCKBACK_DUR,
      });
      if (!isSpike) showDamageNumber(this.scene, e.x, e.y - e.gameObject.height / 2, appliedDmg, '#ffffff', isCrit);
      if (!isSpike && this.player.hasThunder && Math.random() < 0.25) directHit.push({ enemy: e, damage: appliedDmg });
      // 피의 향연 — 치명타 명중 시 HP 회복 (실제 데미지가 들어간 경우만, spike 반사는 제외)
      if (isCrit && !isSpike && this.player.critHealAmount > 0) {
        this.player.heal(this.player.critHealAmount);
      }
      if (dead) {
        this._poisoned.delete(e);
        this._burned.delete(e);
        this._frozen.delete(e);
        this.dropCores(e.x, e.y, e.coreDrops ?? 3, e.isFinalBoss);
        if (e.isBoss) { this.dropRareItem(e.x, e.y); this.boss = null; }
        this.dropEliteItem(e);
        if (this.player.healOnKill > 0) this.player.heal(this.player.healOnKill);
      }
    });

    if (directHit.length > 0) this._applyThunderChain(directHit);
  }

  _applyThunderChain(directHit) {
    const CHAIN_R        = 150;
    const CHAIN_MAX_HOPS = 20;  // 최대 연쇄 횟수 (무한 루프 방지)
    const CHAIN_MIN_DMG  = 1;   // 다음 연쇄에 들어갈 데미지 하한 — 미만이면 중단
    const CHAIN_MULT     = 0.5; // 직전 소스에 들어간 데미지의 50% 가 연쇄 데미지

    const chained  = new Set(directHit.map(d => d.enemy));
    // 첫 타에 죽은 적도 연쇄 원점으로 사용 — gameObject 가 사망 트윈 동안 살아있어 x/y 좌표 유효
    let   frontier = directHit.map(d => ({ enemy: d.enemy, damage: d.damage }));

    for (let hop = 0; hop < CHAIN_MAX_HOPS; hop++) {
      if (frontier.length === 0) break;
      const nextFrontier = [];

      frontier.forEach(({ enemy: src, damage: srcDmg }) => {
        if (src.destroyed) return; // gameObject 가 이미 파괴된 경우만 스킵 (좌표 접근 불가)
        const dmg = Math.floor(srcDmg * CHAIN_MULT);
        if (dmg < CHAIN_MIN_DMG) return; // 감쇠 끝 — 더 이상 전파 안 함

        // 1순위: 아직 맞지 않은 가장 가까운 적
        let nearest = null, minD = CHAIN_R;
        this.enemies.forEach(other => {
          if (chained.has(other) || !other.alive) return;
          const d = Phaser.Math.Distance.Between(src.x, src.y, other.x, other.y);
          if (d < minD) { minD = d; nearest = other; }
        });
        // 2순위: 없으면 자신을 제외한 가장 가까운 적 (이미 맞은 적도 다시 튐)
        if (!nearest) {
          minD = CHAIN_R;
          this.enemies.forEach(other => {
            if (other === src || !other.alive) return;
            const d = Phaser.Math.Distance.Between(src.x, src.y, other.x, other.y);
            if (d < minD) { minD = d; nearest = other; }
          });
        }
        if (!nearest) return;

        this._drawLightningLine(src.x, src.y, nearest.x, nearest.y);
        const died = nearest.poisonHp(dmg);
        showDamageNumber(this.scene, nearest.x, nearest.y - nearest.gameObject.height / 2, dmg, '#ddff22');
        if (died) {
          this.dropCores(nearest.x, nearest.y, nearest.coreDrops ?? 3, nearest.isFinalBoss);
          if (nearest.isBoss) { this.dropRareItem(nearest.x, nearest.y); this.boss = null; }
          this.dropEliteItem(nearest);
          if (this.player.healOnKill > 0) this.player.heal(this.player.healOnKill);
        }
        chained.add(nearest);
        nextFrontier.push({ enemy: nearest, damage: dmg });
      });

      frontier = nextFrontier;
    }
  }

  _drawLightningLine(x1, y1, x2, y2) {
    const gfx  = this.scene.add.graphics().setDepth(15);
    const segs = 5;
    const pts  = [{ x: x1, y: y1 }];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push({
        x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * 18,
        y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * 18,
      });
    }
    pts.push({ x: x2, y: y2 });

    gfx.lineStyle(4, 0xddff22, 0.55);
    gfx.beginPath();
    pts.forEach((p, i) => (i === 0 ? gfx.moveTo(p.x, p.y) : gfx.lineTo(p.x, p.y)));
    gfx.strokePath();

    gfx.lineStyle(1.5, 0xffffff, 0.95);
    gfx.beginPath();
    pts.forEach((p, i) => (i === 0 ? gfx.moveTo(p.x, p.y) : gfx.lineTo(p.x, p.y)));
    gfx.strokePath();

    this.scene.tweens.add({
      targets: gfx, alpha: 0,
      duration: 300, ease: 'Quad.In',
      onComplete: () => gfx.destroy(),
    });
  }

  _inOrientedRect(px, py, ox, oy, { x: dx, y: dy }, length, halfW) {
    const relX  = px - ox, relY  = py - oy;
    const along = relX * dx    + relY * dy;
    const perp  = relX * (-dy) + relY * dx;
    return along >= 0 && along <= length && Math.abs(perp) <= halfW;
  }

  /** 엘리트 처치 시 패시브 아이템 드롭 이벤트 발행 */
  dropEliteItem(enemy) {
    if (!enemy.isElite) return;
    this.scene.events.emit('elite-killed', { x: enemy.x, y: enemy.y });
  }

  dropCores(x, y, count, isBoss = false) {
    if (isBoss) { this.dropCoresBoss(x, y, count); return; }
    ({ x, y } = this.scene.roomManager?.findSafeDropPos(x, y) ?? { x, y });
    // 영구 해금 '코어 수집기' (×1.15) — 소수점은 반올림, 최소 1개는 보장
    const mult = this.player?.coreDropMult ?? 1;
    const finalCount = Math.max(1, Math.round(count * mult));
    for (let i = 0; i < finalCount; i++) this.cores.push(new Core(this.scene, x, y));
  }

  /** 보스 처치 전용: 코어를 방 전체에 분산 드롭 (Core 초기 tween을 교체) */
  dropCoresBoss(x, y, count) {
    const mult = this.player?.coreDropMult ?? 1;
    const finalCount = Math.max(1, Math.round(count * mult));
    const wb  = this.scene.physics.world.bounds;
    const pad = 50;
    for (let i = 0; i < finalCount; i++) {
      const tx   = wb.x + pad + Math.random() * (wb.width  - pad * 2);
      const ty   = wb.y + pad + Math.random() * (wb.height - pad * 2);
      const core = new Core(this.scene, x, y);
      this.scene.tweens.killTweensOf(core.gameObject);
      core.gameObject.setPosition(x, y);
      this.scene.tweens.add({
        targets:  core.gameObject,
        x: tx, y: ty,
        duration: 250 + Math.random() * 200,
        ease:     'Quad.Out',
        onComplete: () => {
          if (!core.alive) return;
          this.scene.tweens.add({
            targets: core.gameObject, y: ty - 5,
            duration: 750, yoyo: true, repeat: -1, ease: 'Sine.InOut',
          });
        },
      });
      this.cores.push(core);
    }
  }
}
