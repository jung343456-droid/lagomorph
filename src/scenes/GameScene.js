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
    this.roomManager.init(generateDungeon());

    // 시작 방 — 이전 런에서 한 번이라도 획득한 아이템 중 랜덤 1개
    this._passiveItems = [];
    this._spawnStartRoomItem();

    // 보스 클리어 시 랜덤 아이템 드롭 + 층 진행
    this.events.on('boss-cleared', ({ x, y, floor }) => {
      const allIds = Object.keys(ITEM_DEFS);
      const id = allIds[Math.floor(Math.random() * allIds.length)];
      this._passiveItems.push(new PassiveItem(this, x, y, id));
      if (floor < 3) {
        this.time.delayedCall(2500, () => this._advanceFloor());
      } else {
        this.time.delayedCall(1500, () => this._showZoneClear());
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
    this.currentFloor++;
    const cam = this.cameras.main;
    cam.fadeOut(500, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      this._passiveItems.forEach(i => { if (i.alive) i.dispose(); });
      this._passiveItems = [];
      this.enemyManager.clearAll();
      this.roomManager.setFloor(this.currentFloor);
      this.roomManager.init(generateDungeon());
      this._spawnStartRoomItem();
      this.events.emit('floor-changed', this.currentFloor);
      cam.fadeIn(500, 0, 0, 0);
      cam.once('camerafadeincomplete', () => this._showFloorBanner(this.currentFloor));
    });
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
  }
}
