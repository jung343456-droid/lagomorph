import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../main';
import Player from '../entities/Player';
import InputManager from '../utils/InputManager';
import AttackManager from '../systems/AttackManager';
import EnemyManager from '../systems/EnemyManager';
import { generateDungeon } from '../world/DungeonGenerator';
import RoomManager from '../world/RoomManager';
import { ROOM_W, ROOM_H } from '../world/Room';

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

    // 카메라는 RoomManager 가 setBounds 설정하므로 여기선 follow 만 등록
    this.cameras.main.startFollow(this.player.gameObject, true, 0.08, 0.08);

    this.scene.launch('UIScene', { gameScene: this });

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
  }
}
