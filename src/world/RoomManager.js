import Room, { ROOM_W, ROOM_H, WALL_T, DOOR_W, DOOR_HX, DOOR_VY } from './Room';

const TRIGGER_MARGIN = 20; // 문 전환 트리거 여백: 방 가장자리에서 이 거리 이내 진입 시 방 전환 (px)

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

    scene.events.on('all-enemies-dead', this._onRoomCleared, this);
  }

  /** DungeonGenerator 결과를 받아 첫 방 진입 */
  init(dungeonData) {
    this.dungeonData = dungeonData;
    this._enterRoom(dungeonData.rooms[dungeonData.startId], null);
  }

  update() {
    if (this._transitioning || !this._room) return;
    if (!this.currentRoomData.cleared) return;
    this._checkDoorTriggers();
  }

  // ── private ─────────────────────────────────────────

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
        const boss = this.enemyManager.boss;
        if (!boss || enemyGo !== boss.gameObject) return;
        if (boss.state !== 'dash' && boss.state !== 'combo_dash') return;
        boss._hitObstacle = true;
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

    // 클리어 방 재진입 시 이동속도 1.5배
    this.player.speed = roomData.cleared
      ? this.player.baseSpeed * 1.5
      : this.player.baseSpeed;

    // 적 스폰 또는 즉시 개방
    if (roomData.cleared) {
      this._room.unlockDoors();
    } else if (roomData.type === 'boss') {
      this._room.lockDoors();
      this.enemyManager.spawnBoss(ROOM_W / 2, ROOM_H / 3);
    } else {
      const enemyCount = 2 + Math.floor(Math.random() * 3); // 2~4
      this._room.lockDoors();
      this.enemyManager.spawnForRoom(enemyCount);
    }

    this.scene.events.emit('room-entered', { roomData, dungeonData: this.dungeonData });
  }

  _onRoomCleared() {
    if (!this.currentRoomData || this.currentRoomData.cleared) return;
    this.currentRoomData.cleared = true;
    this._room.unlockDoors();
    this.scene.cameras.main.flash(300, 100, 220, 160, false);
  }

  _checkDoorTriggers() {
    const px = this.player.x;
    const py = this.player.y;
    const { doors } = this.currentRoomData;

    if (doors.up    !== null && py < TRIGGER_MARGIN && px > DOOR_HX && px < DOOR_HX + DOOR_W)
      return this._startTransition('up', doors.up);

    if (doors.down  !== null && py > ROOM_H - TRIGGER_MARGIN && px > DOOR_HX && px < DOOR_HX + DOOR_W)
      return this._startTransition('down', doors.down);

    if (doors.left  !== null && px < TRIGGER_MARGIN && py > DOOR_VY && py < DOOR_VY + DOOR_W)
      return this._startTransition('left', doors.left);

    if (doors.right !== null && px > ROOM_W - TRIGGER_MARGIN && py > DOOR_VY && py < DOOR_VY + DOOR_W)
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
