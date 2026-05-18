import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';
import { GAME_W, GAME_H } from './constants';
export { GAME_W, GAME_H };

const config = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  parent: 'game-container',
  backgroundColor: '#0d0d0d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  input: {
    activePointers: 3, // 멀티터치 최대 3포인터
  },
  scene: [BootScene, GameScene, UIScene],
};

export default new Phaser.Game(config);
