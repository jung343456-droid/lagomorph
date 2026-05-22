import Phaser from 'phaser';
import { GAME_W, GAME_H, HUD_H } from '../constants';
import Player from '../entities/Player';
import InputManager from '../utils/InputManager';
import AttackManager from '../systems/AttackManager';
import EnemyManager from '../systems/EnemyManager';
import { generateDungeon } from '../world/DungeonGenerator';
import RoomManager from '../world/RoomManager';
import { ROOM_W, ROOM_H } from '../world/Room';
import PassiveItem, { ITEM_DEFS } from '../entities/PassiveItem';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.player        = new Player(this, ROOM_W / 2, ROOM_H / 2);
    this.input$        = new InputManager(this);
    this.enemyManager  = new EnemyManager(this, this.player);
    this.attackManager = new AttackManager(this, this.player);

    this.currentFloor = 1;

    // 던전 생성 → 첫 방 진입
    this.roomManager = new RoomManager(this, this.player, this.enemyManager);
    this.roomManager.setFloor(this.currentFloor);
    this.roomManager.init(generateDungeon());

    // 시작 방 — 이전 런에서 한 번이라도 획득한 아이템 중 랜덤 1개
    this._passiveItems = [];
    this._spawnStartRoomItem();

    // 계단 상태 (아래층 진입 트리거)
    this._stairs           = null;
    this._stairsRoomId     = null;
    this._stairsPos        = null;
    this._stairsTriggered  = false;

    // 보스 클리어: 랜덤 아이템 드롭 + 계단 표시(층1~4) / 구역 클리어(층5)
    this.events.on('boss-cleared', ({ x, y, floor, roomId }) => {
      const allIds = Object.keys(ITEM_DEFS);
      const id = allIds[Math.floor(Math.random() * allIds.length)];
      this._passiveItems.push(new PassiveItem(this, x, y, id));
      if (floor < 5) {
        // 중간보스(층 3 Wolf 2마리) 처치 보상: 30 회복 아이템 추가 드롭
        if (floor === 3) this.enemyManager.dropRareItem(x - 40, y);
        this.time.delayedCall(800, () => this._markStairs(roomId, x, y + 90));
      } else {
        this.time.delayedCall(1500, () => this._showZoneClear());
      }
    });

    // 보스가 없는 층: 일반 방 클리어 시 그 방에 계단 표시
    this.events.on('floor-exit-ready', ({ x, y, floor, roomId }) => {
      if (floor < 3) this.time.delayedCall(500, () => this._markStairs(roomId, x, y));
    });

    // 방 입장 시 계단 가시성 동기화 (다른 방으로 이동하면 계단 숨김, 돌아오면 재생성)
    this.events.on('room-entered', ({ roomData }) => {
      if (this._stairsRoomId === null) return;
      const inStairsRoom = roomData.id === this._stairsRoomId;
      if (inStairsRoom && !this._stairs) {
        this._spawnStairs(this._stairsPos.x, this._stairsPos.y);
      } else if (!inStairsRoom && this._stairs) {
        this._disposeStairs();
      }
    });

    // 카메라 뷰포트를 HUD 아래 영역으로 제한 → 게임/HUD 영역 시각적 분리
    this.cameras.main.setViewport(0, HUD_H, GAME_W, GAME_H - HUD_H);
    this.cameras.main.startFollow(this.player.gameObject, true, 0.08, 0.08);

    this.scene.launch('UIScene', { gameScene: this });

    // 디버그: 숫자 2 → 보스방 즉시 이동
    this.input.keyboard.on('keydown-TWO', () => {
      const dungeon = this.roomManager.dungeonData;
      if (!dungeon) return;
      const bossRoom = dungeon.rooms.find(r => r.type === 'boss');
      if (!bossRoom) return;
      this.roomManager._enterRoom(bossRoom, null);
    });

    this.events.once('player-dead', () => {
      this.time.delayedCall(400, () => {
        this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.75)
          .setScrollFactor(0).setDepth(100).setOrigin(0);
        this.add.text(GAME_W / 2, GAME_H / 2 - 36, 'GAME OVER', {
          fontSize: '38px', color: '#ff4444', fontFamily: 'monospace',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
        this.add.text(GAME_W / 2, GAME_H / 2 + 20, 'TAP TO RESTART', {
          fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
        this.input.once('pointerdown', () => {
          this.scene.stop('UIScene');
          this.scene.restart();
        });
      });
    });
  }

  _spawnStartRoomItem() {
    const unlocked = PassiveItem.getUnlocked();
    if (unlocked.length > 0) {
      const id = unlocked[Math.floor(Math.random() * unlocked.length)];
      this._passiveItems.push(new PassiveItem(this, ROOM_W / 2 + 80, ROOM_H / 2, id));
    }
  }

  _advanceFloor() {
    this._disposeStairs();
    this._stairsRoomId    = null;
    this._stairsPos       = null;
    this._stairsTriggered = false;
    this.currentFloor++;
    const cam = this.cameras.main;
    cam.fadeOut(500, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      this._passiveItems.forEach(i => { if (i.alive) i.dispose(); });
      this._passiveItems = [];
      this.enemyManager.clearAll();
      this.roomManager.setFloor(this.currentFloor);
      this.roomManager.init(generateDungeon());
      this.events.emit('floor-changed', this.currentFloor);
      cam.fadeIn(500, 0, 0, 0);
      cam.once('camerafadeincomplete', () => this._showFloorBanner(this.currentFloor));
    });
  }

  /** 특정 방의 (x,y)에 계단 위치를 등록 — 현재 방이면 즉시 표시 */
  _markStairs(roomId, x, y) {
    this._stairsRoomId = roomId;
    this._stairsPos    = { x, y };
    if (this.roomManager.currentRoomData?.id === roomId) {
      this._spawnStairs(x, y);
    }
  }

  _spawnStairs(x, y) {
    if (this._stairs) return;
    const rect = this.add.rectangle(x, y, 44, 44, 0x1a1a3a)
      .setStrokeStyle(2, 0x4ecca3).setDepth(8);
    const text = this.add.text(x, y, '▼', {
      fontSize: '26px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9);
    const pulse = this.tweens.add({
      targets: [rect, text], scaleX: 1.15, scaleY: 1.15,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    this._stairs = { rect, text, pulse };
  }

  _disposeStairs() {
    if (!this._stairs) return;
    this._stairs.pulse?.remove();
    if (this._stairs.rect.active) this._stairs.rect.destroy();
    if (this._stairs.text.active) this._stairs.text.destroy();
    this._stairs = null;
  }

  _showFloorBanner(floor) {
    const txt = this.add.text(ROOM_W / 2, ROOM_H / 2, `FLOOR ${floor}`, {
      fontSize: '36px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(90).setAlpha(0);
    this.tweens.add({
      targets: txt, alpha: 1, duration: 400, ease: 'Quad.Out',
      onComplete: () => {
        this.time.delayedCall(1000, () => {
          this.tweens.add({
            targets: txt, alpha: 0, duration: 400, ease: 'Quad.In',
            onComplete: () => { if (txt.active) txt.destroy(); },
          });
        });
      },
    });
  }

  _showZoneClear() {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(100).setOrigin(0);
    this.add.text(GAME_W / 2, GAME_H / 2 - 40, 'ZONE 1 CLEAR', {
      fontSize: '30px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.add.text(GAME_W / 2, GAME_H / 2 + 10, '구역 1 클리어!', {
      fontSize: '17px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.add.text(GAME_W / 2, GAME_H / 2 + 50, 'TAP TO RESTART', {
      fontSize: '14px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    this.input.once('pointerdown', () => {
      this.scene.stop('UIScene');
      this.scene.restart();
    });
  }

  update(_time, delta) {
    this.player.update(this.input$.getDirection(), delta);
    this.attackManager.update(delta);
    this.enemyManager.update(delta);
    this.roomManager.update();

    for (const item of this._passiveItems) {
      if (!item.alive) continue;
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, item.x, item.y,
      );
      if (d < 30) item.collect(this.player);
    }

    if (this._stairs && !this._stairsTriggered) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this._stairs.rect.x, this._stairs.rect.y,
      );
      if (d < 28) {
        this._stairsTriggered = true;
        this._advanceFloor();
      }
    }
  }
}
