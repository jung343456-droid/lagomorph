import Room, { ROOM_W, ROOM_H, WALL_T, DOOR_W, DOOR_HX, DOOR_VY } from './Room';
import { markShopDiscovered } from '../data/MetaProgress';
import { displayFloor } from '../constants';

const TRIGGER_MARGIN  = 45;  // 문 전환 트리거 여백: 플레이어 center 가 방 가장자리에서 이 거리 이내일 때 전환 (px). 플레이어 body half-size(≈27) 보다 커야 함 — 월드 경계에 막혀 center 가 더 가까이 못 감.
const TRIGGER_VEL_MIN = 30;  // 문 트리거 발화에 필요한 최소 속도 (px/s) — 의도된 진입만 허용
const ENTER_GRACE_MS  = 450; // 방 진입 직후 문 트리거 차단 시간 (ms) — 연쇄 전환 방지
const CLEAR_GRACE_MS  = 700; // 방 클리어 직후 문 트리거 차단 시간 (ms) — 적 처치 위치가 문 근처일 때 즉시 전환 방지

export default class RoomManager {
  constructor(scene, player, enemyManager) {
    this.scene        = scene;
    this.player       = player;
    this.enemyManager = enemyManager;

    this.dungeonData      = null;
    this.currentRoomData  = null;
    this._room            = null;
    this._wallColliders   = [];
    this._transitioning   = false;
    this._enteredAt       = 0;
    this._clearedAt       = 0;
    this.floorNum         = 1;  // 현재 층 번호 (1~20 선형 카운터, 구역 = ceil/5)
    this._roomDrops       = new Map(); // roomId → { cores:[{x,y}], items:[{x,y,healAmount}] }

    scene.events.on('all-enemies-dead',   this._onRoomCleared,      this);
    scene.events.on('secret-door-opened', this._onSecretDoorOpened, this);
  }

  destroy() {
    this.scene.events.off('all-enemies-dead',   this._onRoomCleared,      this);
    this.scene.events.off('secret-door-opened', this._onSecretDoorOpened, this);
  }

  setFloor(n) {
    this.floorNum = n;
    this.enemyManager.setFloor(n);
    this._roomDrops.clear(); // 층 전환 시 이전 층 드롭 캐시 초기화
  }

  serializeRoomDrops() {
    if (this._roomDrops.size === 0) return undefined;
    const out = {};
    for (const [id, drops] of this._roomDrops) out[id] = drops;
    return out;
  }

  restoreRoomDropsFromSave(data) {
    if (!data) return;
    for (const [key, drops] of Object.entries(data)) {
      this._roomDrops.set(parseInt(key, 10), drops);
    }
  }

  /** 드롭 위치가 장애물 안이면 인근 빈 위치로 보정 — Room 위임 */
  findSafeDropPos(x, y) {
    return this._room?.findSafeDropPos(x, y) ?? { x, y };
  }

  /** DungeonGenerator 결과를 받아 첫 방 진입 */
  init(dungeonData) {
    this.dungeonData = dungeonData;
    this._enterRoom(dungeonData.rooms[dungeonData.startId], null);
  }

  /** 임시 저장 복원 — 저장된 던전/현재 방으로 진입하되 적은 스폰하지 않는다(EnemyManager 가 주입). */
  restore(dungeonData, currentRoomId) {
    this.dungeonData = dungeonData;
    const room = dungeonData.rooms[currentRoomId] ?? dungeonData.rooms[dungeonData.startId];
    this._enterRoom(room, null, { skipSpawn: true });
  }

  update() {
    if (this._transitioning || !this._room) return;
    // 엘리트 비밀방은 미클리어 상태에서도 이탈 가능 (도망 가능 설계)
    const isEliteCache = this.currentRoomData.type === 'secret_cache'
                      && this.currentRoomData.cacheSubtype === 'elite';
    if (!this.currentRoomData.cleared && !isEliteCache) return;
    const now = this.scene.time.now;
    if (now - this._enteredAt < ENTER_GRACE_MS) return;
    if (this._clearedAt > 0 && now - this._clearedAt < CLEAR_GRACE_MS) return;
    this._checkDoorTriggers();
  }

  // ── private ─────────────────────────────────────────

  /** 일반 전투방 적 수:
   *   구역 1 — 층1=2~3, 층2=3~4, 층3=3~4, 층4=4~5, 층5=4~5
   *   구역 2 — 층6=3~4, 층7=3~4, 층8=4~5, 층9=4~5, 층10=4~5
   *   구역 2(11~20) — 구역 1 후반과 동일 분포 (적은 ZONE34 배수로 강화됨)
   */
  _normalRoomCount() {
    // 표시층(1~10) 기준 — 모든 구역 공용. 적은 구역별로 강화/교체되므로 수만 표시층으로 통일.
    const byDisplay = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4, 6: 3, 7: 3, 8: 4, 9: 4, 10: 4 };
    const base = byDisplay[displayFloor(this.floorNum)] ?? 3;
    return base + Math.floor(Math.random() * 2);
  }

  /** 출구방(보스 없는 층의 가장 먼 방) 적 수: 일반 +2 */
  _exitRoomCount() {
    return this._normalRoomCount() + 2;
  }

  _enterRoom(roomData, fromDir, opts = {}) {
    // 현재 방의 코어/아이템 위치를 저장하고 게임 오브젝트를 즉시 정리.
    // _clearAll 이 아직 호출되기 전에 먼저 추출해야 데이터가 보존된다.
    if (this.currentRoomData) {
      const drops = this.enemyManager.extractDropPositions();
      if (drops.cores.length || drops.items.length) {
        this._roomDrops.set(this.currentRoomData.id, drops);
      }
    }

    // 엘리트 비밀방을 미클리어 상태로 이탈하면 남은 적을 즉시 정리.
    // 엘리트방은 도망 가능 설계라 미클리어 상태에서도 문 트리거가 발화되는데,
    // spawn 메서드를 거치지 않고 이전 방으로 넘어가면 _clearAll() 이 호출되지 않아
    // 엘리트가 이전 방에 그대로 남아 따라오는 버그 방지.
    const leavingEliteCache = this.currentRoomData?.type === 'secret_cache'
                           && this.currentRoomData?.cacheSubtype === 'elite'
                           && !this.currentRoomData?.cleared;
    if (leavingEliteCache) this.enemyManager.clearAll();

    // 떠나는 방의 잔존 위험물(거미줄·독 웅덩이) 정리 — 모든 전환에서 수행.
    // 클리어된 방 재진입은 spawnForRoom(→_clearAll)을 타지 않아 여기서 정리하지 않으면
    // 좌표 공유(모든 방 0~ROOM_W/H)로 이전 방 hazard 가 다음 방에 그대로 남는다.
    this.enemyManager.clearLingeringHazards();

    // 기존 물리 콜라이더 제거 → 기존 방 파괴
    this._wallColliders.forEach(c => c.destroy());
    this._wallColliders = [];
    if (this._room) this._room.destroy();

    // 새 방 생성 (floorNum → 구역 2(11층+) 보라톤 틴트 판단용)
    this._room = new Room(this.scene, roomData, this.floorNum);
    this.currentRoomData = roomData;
    const wasVisited = roomData.visited;
    roomData.visited = true;

    // 벽 콜라이더 등록
    const wg = this._room.wallGroup;
    const og = this._room.obstacleGroup;
    this._wallColliders.push(
      this.scene.physics.add.collider(wg, this.player.gameObject),
      this.scene.physics.add.collider(wg, this.enemyManager.enemyGroup),
      this.scene.physics.add.collider(og, this.player.gameObject),
      this.scene.physics.add.collider(og, this.enemyManager.enemyGroup, (obs, enemyGo) => {
        // 보스 FANG dash + Boar charge 시 장애물 파괴 → 돌격 지속
        const enemy = this.enemyManager.enemies.find(e => e.gameObject === enemyGo);
        if (!enemy) return;
        const isBossDash = enemy.isBoss && (enemy.state === 'dash' || enemy.state === 'combo_dash');
        const isBoarCharge = enemy.displayName === '멧돼지' && enemy.state === 'charge';
        if (!isBossDash && !isBoarCharge) return;
        enemy._hitObstacle = true;
        this._room.destroyObstacle(obs);
      }),
    );

    // 물리 월드 경계 = 방 크기로 고정 (적 탈출 방지)
    this.scene.physics.world.setBounds(0, 0, ROOM_W, ROOM_H);

    // 카메라 고정 (방 크기 = 캔버스 크기이므로 스크롤 없음)
    this.scene.cameras.main.setBounds(0, 0, ROOM_W, ROOM_H);
    this.scene.cameras.main.setScroll(0, 0);

    // 플레이어 진입 위치
    const entry = this._entryPos(fromDir);
    this.player.gameObject.setPosition(entry.x, entry.y);
    this.player.gameObject.body.reset(entry.x, entry.y);

    // 진입 직후 문 트리거 차단을 위한 타임스탬프 갱신
    this._enteredAt = this.scene.time.now;
    this._clearedAt = 0;

    // 클리어 방 재진입(2번째 방문 이상)에서만 이동속도 1.5배
    this.player.speed = (roomData.cleared && wasVisited)
      ? this.player.baseSpeed * 1.5
      : this.player.baseSpeed;

    // 임시 저장 복원: 적은 EnemyManager 가 주입하므로 스폰하지 않고 문 잠금만 결정
    if (opts.skipSpawn) {
      const isSecretRoom = roomData.type === 'secret_cache' || roomData.type === 'secret_vault';
      if (roomData.cleared || isSecretRoom) this._room.unlockDoors();
      else                                  this._room.lockDoors();
      this.scene.events.emit('room-entered', { roomData, dungeonData: this.dungeonData });
      return;
    }

    // 적 스폰 또는 즉시 개방
    if (roomData.cleared) {
      this._room.unlockDoors();
    } else if (roomData.type === 'shop') {
      // 상점방: 적 없음, 진입 즉시 클리어, 문 잠금 없음
      roomData.cleared = true;
      this._room.unlockDoors();
      // 영속 플래그 — 이후 모든 런에서 Hub 에 상점 NPC 가 등장
      markShopDiscovered();
    } else if (roomData.type === 'boss') {
      this._room.lockDoors();
      const df = displayFloor(this.floorNum);
      if (df === 5 || df === 10) {
        // 보스 — 표시 5·10층 (구역별 보스 분기는 EnemyManager.spawnBoss)
        this.enemyManager.spawnBoss(ROOM_W / 2, ROOM_H / 3);
      } else if (df === 3 || df === 8) {
        // 중간 보스 — 표시 3·8층 (구역별 분기는 EnemyManager.spawnMidBoss)
        this.enemyManager.spawnMidBoss(ROOM_W / 2, ROOM_H / 3);
      } else {
        // 그 외 출구방: 보스 없음 — 일반 적 +2~3마리 (항상 3종)
        this.enemyManager.spawnForRoom(this._exitRoomCount(), true);
      }
    } else if (roomData.type === 'secret_vault') {
      // 기억 보관실: 전투 없음, 즉시 클리어, 첫 방문에만 텍스트 표시
      roomData.cleared = true;
      this._room.unlockDoors();
      if (!wasVisited) {
        this.scene.events.emit('vault-entered', { vaultIdx: roomData.vaultIdx });
      }
    } else if (roomData.type === 'secret_cache') {
      if (roomData.cacheSubtype === 'loot') {
        // 보관함 방: 전투 없음, 즉시 클리어, 첫 방문에만 아이템 스폰
        roomData.cleared = true;
        this._room.unlockDoors();
        if (!wasVisited) {
          this.scene.events.emit('secret-cache-entered', {
            x: ROOM_W / 2, y: ROOM_H / 2, reward: roomData.cacheReward,
          });
        }
      } else if (roomData.cacheSubtype === 'altar') {
        // 제단 방: 전투 없음, 즉시 클리어. 제단 엔티티는 GameScene 가 room-entered 에서 스폰/정리
        roomData.cleared = true;
        this._room.unlockDoors();
      } else {
        // 엘리트 방: 출구 열린 상태 유지(도망 가능), 미클리어 상태면 엘리트 스폰.
        // 첫 진입에서 정한 타입을 roomData.eliteType 에 저장해 재진입 시 동일 캐릭터로 풀 HP 재스폰.
        this._room.unlockDoors();
        if (!roomData.cleared) {
          roomData.eliteType = this.enemyManager.spawnSecretElite(
            ROOM_W / 2, ROOM_H / 2, roomData.eliteType ?? null,
          );
        }
      }
    } else {
      // 일반 전투방
      this._room.lockDoors();
      this.enemyManager.spawnForRoom(this._normalRoomCount());
    }

    // 이 방에 이전 방문 시 남겨진 코어/아이템 복원
    const savedDrops = this._roomDrops.get(roomData.id);
    if (savedDrops) {
      this.enemyManager.restoreDrops(savedDrops);
      this._roomDrops.delete(roomData.id);
    }

    this.scene.events.emit('room-entered', { roomData, dungeonData: this.dungeonData });
  }

  _onSecretDoorOpened({ roomId, dir, targetRoomId }) {
    // 현재 방의 비밀 벽이 파괴됨 — 문 데이터에 연결 추가 (이후 도어 트리거가 정상 작동)
    if (this.currentRoomData?.id !== roomId) return;
    this.currentRoomData.doors[dir] = targetRoomId;
    this._room?.drawSecretDoorHint(dir);
  }

  _onRoomCleared() {
    if (!this.currentRoomData || this.currentRoomData.cleared) return;
    this.currentRoomData.cleared = true;
    this.scene.cameras.main.flash(300, 100, 220, 160, false);
    this._room.unlockDoors();
    this._clearedAt = this.scene.time.now;

    // 영구 해금 '전투 적응' — 방 클리어 시 HP 회복
    if (this.player.hpPerRoomClear > 0) this.player.heal(this.player.hpPerRoomClear);

    if (this.currentRoomData.type === 'boss') {
      // 보스방: 계단으로 다음 층 진행 + 인접 방 자유 왕복 가능
      this.scene.events.emit('boss-cleared', {
        x: ROOM_W / 2, y: ROOM_H / 2, floor: this.floorNum, roomId: this.currentRoomData.id,
      });
      return;
    }

    // 보스가 없는 던전(현재 빌드에선 발생하지 않지만 향후 대비): 클리어된 방에 계단 신호
    const hasBoss = this.dungeonData.rooms.some(r => r.type === 'boss');
    if (!hasBoss) {
      this.scene.events.emit('floor-exit-ready', {
        x: ROOM_W / 2, y: ROOM_H / 2, floor: this.floorNum, roomId: this.currentRoomData.id,
      });
    }
  }

  _checkDoorTriggers() {
    const px = this.player.x;
    const py = this.player.y;
    const vx = this.player.gameObject.body.velocity.x;
    const vy = this.player.gameObject.body.velocity.y;
    const { doors } = this.currentRoomData;

    if (doors.up    !== null && py < TRIGGER_MARGIN
        && px > DOOR_HX && px < DOOR_HX + DOOR_W
        && vy < -TRIGGER_VEL_MIN)
      return this._startTransition('up', doors.up);

    if (doors.down  !== null && py > ROOM_H - TRIGGER_MARGIN
        && px > DOOR_HX && px < DOOR_HX + DOOR_W
        && vy >  TRIGGER_VEL_MIN)
      return this._startTransition('down', doors.down);

    if (doors.left  !== null && px < TRIGGER_MARGIN
        && py > DOOR_VY && py < DOOR_VY + DOOR_W
        && vx < -TRIGGER_VEL_MIN)
      return this._startTransition('left', doors.left);

    if (doors.right !== null && px > ROOM_W - TRIGGER_MARGIN
        && py > DOOR_VY && py < DOOR_VY + DOOR_W
        && vx >  TRIGGER_VEL_MIN)
      return this._startTransition('right', doors.right);
  }

  _startTransition(dir, neighborId) {
    if (this._transitioning) return;
    this._transitioning = true;

    const cam = this.scene.cameras.main;
    cam.fadeOut(220, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      // _enterRoom 이 예외를 던져도 화면이 검은 채로 영구 정지(+ _transitioning 잠김)되지 않도록
      // 페이드 인 복구는 항상 수행한다.
      try {
        this._enterRoom(this.dungeonData.rooms[neighborId], dir);
      } finally {
        cam.fadeIn(220, 0, 0, 0);
        cam.once('camerafadeincomplete', () => {
          this._transitioning = false;
        });
      }
    });
  }

  /** dir = 이동한 방향 → 새 방에서의 등장 위치 */
  _entryPos(dir) {
    const m  = WALL_T + 36;
    const cx = ROOM_W / 2;
    const cy = ROOM_H / 2;
    switch (dir) {
      case 'up':    return { x: cx, y: ROOM_H - m };  // 남쪽 문에서 등장
      case 'down':  return { x: cx, y: m };            // 북쪽 문에서 등장
      case 'left':  return { x: ROOM_W - m, y: cy };   // 동쪽 문에서 등장
      case 'right': return { x: m,          y: cy };   // 서쪽 문에서 등장
      default:      return { x: cx,         y: cy };   // 시작방
    }
  }
}
