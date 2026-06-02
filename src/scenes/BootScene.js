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

    // 8방향 플레이어 스프라이트 시트 (950×712, RGBA). create()에서 방향별 프레임으로 분할.
    this.load.image('soma8', 'assets/characters/soma-sprite-sheet8.png');

    // zone-2 용 (석재) — zone-2 에서 다시 사용
    ['tile_floor', 'tile_floor_b', 'tile_crack', 'tile_moss', 'tile_wall', 'tile_obstacle']
      .forEach(key => this.load.image(key, `assets/tiles/${key}.png`));

    // zone-1 용 (풀밭) — 바닥 4종 + 장애물 3종 + 울타리(벽)
    [
      'grass_floor', 'grass_floor_b', 'grass_floor_flowers', 'grass_floor_path',
      'obstacle_fence', 'obstacle_bush', 'obstacle_stump', 'obstacle_tree',
    ].forEach(key => this.load.image(key, `assets/tiles/zone-1/${key}.png`));

    // 적 방향 스프라이트 (8방향) + 액션 스프라이트
    const DIRS = ['n','ne','e','se','s','sw','w','nw'];

    // zone-1 적
    [
      { name: 'fox',      actions: ['idle', 'chase'] },
      { name: 'rat',      actions: ['idle', 'rush'] },
      { name: 'weasel',   actions: ['idle', 'approach', 'dash'] },
      { name: 'hedgehog', actions: ['idle', 'spike'] },
      { name: 'squirrel', actions: ['idle', 'throw'] },
      { name: 'wolf',     actions: ['chase', 'howl', 'aura'] },
      { name: 'fang',     actions: ['chase', 'dash', 'stomp', 'rage'] },
    ].forEach(({ name, actions }) => {
      DIRS.forEach(d => this.load.image(`${name}-${d}`, `assets/enemies/zone-1/${name}/${name}-${d}.png`));
      actions.forEach(a => this.load.image(`${name}-${a}`, `assets/enemies/zone-1/${name}/${name}-${a}.png`));
    });
    this.load.image('squirrel-acorn', 'assets/enemies/zone-1/squirrel/squirrel-acorn.png');

    // zone-2 적 (Deeper Forest)
    [
      { name: 'bat',       actions: ['idle', 'swoop'] },
      { name: 'boar',      actions: ['idle', 'ready', 'charge'] },
      { name: 'spider',    actions: ['idle', 'throw'] },
      { name: 'bear',      actions: ['idle', 'swipe', 'rage'] },
      { name: 'toad',      actions: ['idle', 'spit'] },
      { name: 'blackbear', actions: ['idle', 'slam', 'roar'] },
      { name: 'owlking',   actions: ['idle', 'dive', 'screech', 'whirl', 'rage'] },
    ].forEach(({ name, actions }) => {
      DIRS.forEach(d => this.load.image(`${name}-${d}`, `assets/enemies/zone-2/${name}/${name}-${d}.png`));
      actions.forEach(a => this.load.image(`${name}-${a}`, `assets/enemies/zone-2/${name}/${name}-${a}.png`));
    });
    // zone-2 특수 에셋 — 지면 텍스처 / 투사체
    this.load.image('spider-web',      'assets/enemies/zone-2/spider/spider-web.png');
    this.load.image('toad-puddle',     'assets/enemies/zone-2/toad/toad-puddle.png');
    this.load.image('owlking-feather', 'assets/enemies/zone-2/owlking/owlking-feather.png');
  }

  create() {
    this._generateTextures();
    this._processPlayerSprites();
    this.scene.start('HubScene');
  }

  // 8방향 스프라이트 시트(soma8, 4열×2행)를 방향별 프레임으로 분할.
  // 각 칸의 캐릭터 내용물 경계(투명 영역 제외)에 맞춰 타이트하게 잘라
  // 방향 전환 시 위치가 흔들리지 않도록 한다. (rect: [x, y, w, h])
  _processPlayerSprites() {
    const FRAMES = {
      'bottom':       [ 38,  67, 178, 240],
      'top':          [266,  53, 179, 254],
      'left':         [491,  53, 215, 248],
      'right':        [712,  53, 217, 248],
      'bottom-left':  [ 29, 397, 187, 239],
      'top-left':     [258, 393, 192, 248],
      'top-right':    [504, 393, 192, 248],
      'bottom-right': [737, 397, 188, 239],
    };
    const texture = this.textures.get('soma8');
    Object.entries(FRAMES).forEach(([dir, [x, y, w, h]]) => {
      texture.add(dir, 0, x, y, w, h);
    });
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

    // poop_circle: 설치형 공격용 흰 원형 (런타임에 tint·displaySize 적용)
    g.clear();
    g.fillStyle(0xffffff);
    g.fillCircle(40, 40, 40);
    g.generateTexture('poop_circle', 80, 80);

    // grim: 40x50 잿빛털 토끼 상인 (한쪽 귀 흉터 + 어깨 가방)
    g.clear();
    const FUR  = 0x8a8a86;
    const DARK = 0x4a4a48;
    // 귀 (좌·우)
    g.fillStyle(FUR);
    g.fillRoundedRect(13, 2,  4, 16, 2);
    g.fillRoundedRect(23, 2,  4, 16, 2);
    // 우측 귀 흉터
    g.fillStyle(DARK);
    g.fillRect(23, 8, 4, 2);
    // 머리
    g.fillStyle(FUR);
    g.fillCircle(20, 20, 10);
    // 몸통
    g.fillRoundedRect(8, 24, 24, 22, 4);
    // 눈
    g.fillStyle(0x222222);
    g.fillCircle(17, 19, 1.5);
    g.fillCircle(23, 19, 1.5);
    // 코
    g.fillStyle(0xcc7766);
    g.fillCircle(20, 23, 1);
    // 어깨 가방 (좌측)
    g.fillStyle(0x6b4226);
    g.fillRoundedRect(1, 28, 9, 12, 2);
    g.fillStyle(0x4a2e1a);
    g.fillRect(1, 28, 9, 2);
    g.generateTexture('grim', 40, 50);

    g.destroy();
  }
}
