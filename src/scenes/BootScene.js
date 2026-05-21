import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../main';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;

    const bg = this.add.rectangle(cx, cy, GAME_W, GAME_H, 0x0d0d0d);

    const title = this.add.text(cx, cy - 80, 'LAGOMORPH', {
      fontSize: '28px',
      color: '#4ecca3',
      fontFamily: 'monospace',
      letterSpacing: 6,
    }).setOrigin(0.5);

    const barBg = this.add.rectangle(cx, cy, 260, 6, 0x333333).setOrigin(0.5, 0.5);
    const bar = this.add.rectangle(cx - 130, cy, 0, 6, 0x4ecca3).setOrigin(0, 0.5);

    const label = this.add.text(cx, cy + 24, 'Loading...', {
      fontSize: '13px',
      color: '#666666',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.load.on('progress', (v) => {
      bar.width = 260 * v;
    });

    this.load.on('complete', () => {
      label.setText('');
    });

    ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left']
      .forEach(d => this.load.image(`soma-${d}`, `assets/characters/soma-${d}.png`));

    ['tile_floor', 'tile_floor_b', 'tile_crack', 'tile_moss', 'tile_wall', 'tile_obstacle']
      .forEach(key => this.load.image(key, `assets/tiles/${key}.png`));

    // 적 방향 스프라이트 (8방향) + 액션 스프라이트
    const DIRS = ['n','ne','e','se','s','sw','w','nw'];
    [
      { name: 'fox',      actions: ['idle', 'chase'] },
      { name: 'rat',      actions: ['idle', 'rush'] },
      { name: 'weasel',   actions: ['idle', 'approach', 'dash'] },
      { name: 'hedgehog', actions: ['idle', 'spike'] },
      { name: 'squirrel', actions: ['idle', 'throw'] },
      { name: 'wolf',     actions: ['chase', 'howl', 'aura'] },
      { name: 'fang',     actions: ['chase', 'dash', 'stomp', 'rage'] },
    ].forEach(({ name, actions }) => {
      DIRS.forEach(d => this.load.image(`${name}-${d}`, `assets/enemies/${name}/${name}-${d}.png`));
      actions.forEach(a => this.load.image(`${name}-${a}`, `assets/enemies/${name}/${name}-${a}.png`));
    });
    this.load.image('squirrel-acorn', 'assets/enemies/squirrel/squirrel-acorn.png');
  }

  create() {
    this._generateTextures();
    this.scene.start('GameScene');
  }

  // 외부 에셋 없이 실행할 수 있도록 프로그래밍 방식으로 텍스처 생성
  _generateTextures() {
    const g = this.make.graphics({ add: false });

    // player: 32x32 원형
    g.clear();
    g.fillStyle(0x4ecca3);
    g.fillCircle(16, 16, 13);
    g.fillStyle(0xffffff);
    g.fillCircle(21, 11, 4);
    g.fillStyle(0x0d0d0d);
    g.fillCircle(22, 11, 2);
    g.generateTexture('player_tex', 32, 32);

    g.destroy();
  }
}
