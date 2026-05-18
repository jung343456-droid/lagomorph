import Phaser from 'phaser';
import { GAME_W, GAME_H, HUD_H } from '../constants';
import Player from '../entities/Player';
import InputManager from '../utils/InputManager';
import AttackManager from '../systems/AttackManager';
import EnemyManager from '../systems/EnemyManager';
import { generateDungeon } from '../world/DungeonGenerator';
import RoomManager from '../world/RoomManager';
import { ROOM_W, ROOM_H } from '../world/Room';
import PassiveItem from '../entities/PassiveItem';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.player        = new Player(this, ROOM_W / 2, ROOM_H / 2);
    this.input$        = new InputManager(this);
    this.enemyManager  = new EnemyManager(this, this.player);
    this.attackManager = new AttackManager(this, this.player);

    // 던전 생성 → 첫 방 진입
    this.roomManager = new RoomManager(this, this.player, this.enemyManager);
    this.roomManager.init(generateDungeon());

    // 시작 방에 패시브 아이템 1개 랜덤 배치
    const itemIds = ['wide_claws', 'sharp_claws', 'poison_claws', 'explosive_trap', 'frugal_instinct', 'big_trap'];
    this._passiveItem = new PassiveItem(
      this,
      ROOM_W / 2 + 80, ROOM_H / 2,
      itemIds[Math.floor(Math.random() * itemIds.length)],
    );

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

  update(_time, delta) {
    this.player.update(this.input$.getDirection(), delta);
    this.attackManager.update(delta);
    this.enemyManager.update(delta);
    this.roomManager.update();

    if (this._passiveItem?.alive) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this._passiveItem.x, this._passiveItem.y,
      );
      if (d < 30) this._passiveItem.collect(this.player);
    }
  }
}
