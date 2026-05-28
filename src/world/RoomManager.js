import Room, { ROOM_W, ROOM_H, WALL_T, DOOR_W, DOOR_HX, DOOR_VY } from './Room';
import { markShopDiscovered } from '../data/MetaProgress';

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
    this.floorNum         = 1;  // 현재 층 번호 (1~3)

    scene.events.on('all-enemies-dead', this._onRoomCleared, this);
  }

  setFloor(n) {
    this.floorNum = n;
    this.enemyManager.setFloor(n);
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

  update() {
    if (this._transitioning || !this._room) return;
    if (!this.currentRoomData.cleared) return;
    const now = this.scene.time.now;
    if (now - this._enteredAt < ENTER_GRACE_MS) return;
    if (this._clearedAt > 0 && now - this._clearedAt < CLEAR_GRACE_MS) return;
    this._checkDoorTriggers();
  }

  // ── private ─────────────────────────────────────────

  /** 일반 전투방 적 수:
   *   구역 1 — 층1=2~3, 층2=3~4, 층3=3~4, 층4=4~5, 층5=4~5
   *   구역 2 — 층6=3~4, 층7=3~4, 층8=4~5, 층9=4~5, 층10=4~5
   */
  _normalRoomCount() {
    const baseByFloor = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4, 6: 3, 7: 3, 8: 4, 9: 4, 10: 4 };
    const base = baseByFloor[this.floorNum] ?? 3;
    return base + Math.floor(Math.random() * 2);
  }

  /** 출구방(보스 없는 층의 가장 먼 방) 적 수: 일반 +2 */
  _exitRoomCount() {
    return this._normalRoomCount() + 2;
  }

  _enterRoom(roomData, fromDir) {
    // 기존 물리 콜라이더 제거 → 기존 방 파괴
    this._wallColliders.forEach(c => c.destroy());
    this._wallColliders = [];
    if (this._room) this._room.destroy();

    // 새 방 생성
    this._room = new Room(this.scene, roomData);
    this.currentRoomData = roomData;
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

    // 클리어 방 재진입 시 이동속도 1.5배
    this.player.speed = roomData.cleared
      ? this.player.baseSpeed * 1.5
      : this.player.baseSpeed;

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
      if (this.floorNum === 5) {
        // 층 5: FANG (구역 1 최종)
        this.enemyManager.spawnBoss(ROOM_W / 2, ROOM_H / 3);
      } else if (this.floorNum === 10) {
        // 층 10: OWL KING (구역 2 최종)
        this.enemyManager.spawnBoss(ROOM_W / 2, ROOM_H / 3);
      } else if (this.floorNum === 3 || this.floorNum === 8) {
        // 층 3: Wolf 2마리 / 층 8: BlackBear — 중간 보스
        this.enemyManager.spawnMidBoss(ROOM_W / 2, ROOM_H / 3);
      } else {
        // 층 1·2·4·6·7·9: 보스 없음 — 일반 적 +2~3마리 (출구방, 항상 3종)
        this.enemyManager.spawnForRoom(this._exitRoomCount(), true);
      }
    } else {
      // 일반 전투방
      this._room.lockDoors();
      this.enemyManager.spawnForRoom(this._normalRoomCount());
    }

    this.scene.events.emit('room-entered', { roomData, dungeonData: this.dungeonData });
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
      this._enterRoom(this.dungeonData.rooms[neighborId], dir);
      cam.fadeIn(220, 0, 0, 0);
      cam.once('camerafadeincomplete', () => {
        this._transitioning = false;
      });
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
