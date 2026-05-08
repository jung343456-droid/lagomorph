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
  }

  update(_time, delta) {
    this.player.update(this.input$.getDirection());
    this.attackManager.update(delta);
    this.enemyManager.update(delta);
    this.roomManager.update();
  }
}
