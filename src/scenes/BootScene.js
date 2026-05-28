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

    // 구역 2 적 — 실 에셋 준비 전 placeholder 로 구역 1 스프라이트를 별도 키로 재로드.
    //   추후 assets/enemies/{bat,boar,spider,bear,toad,blackbear,owlking}/ 디렉토리가 추가되면
    //   아래 PLACEHOLDER_MAP 의 매핑을 제거하고 실제 경로로 교체하면 된다.
    const PLACEHOLDER_MAP = [
      { name: 'bat',       proxy: 'rat',      actions: ['idle', 'swoop'] },
      { name: 'boar',      proxy: 'fox',      actions: ['idle', 'ready', 'charge'] },
      { name: 'spider',    proxy: 'squirrel', actions: ['idle', 'throw'] },
      { name: 'bear',      proxy: 'hedgehog', actions: ['idle', 'swipe', 'rage'] },
      { name: 'toad',      proxy: 'squirrel', actions: ['idle', 'spit'] },
      { name: 'blackbear', proxy: 'wolf',     actions: ['idle', 'slam', 'roar'] },
      { name: 'owlking',   proxy: 'fang',     actions: ['idle', 'dive', 'screech', 'whirl', 'rage'] },
    ];
    PLACEHOLDER_MAP.forEach(({ name, proxy, actions }) => {
      DIRS.forEach(d => {
        // proxy 가 actions 에 'idle' 만 있고 8방향 키만 있는 경우(예: rat 은 rat-{dir}.png 가 존재)
        this.load.image(`${name}-${d}`, `assets/enemies/${proxy}/${proxy}-${d}.png`);
      });
      actions.forEach(a => {
        // proxy 에 동일 액션 키가 있으면 그대로, 없으면 idle 로 fallback
        const proxyHas = {
          fox:      ['idle', 'chase'],
          rat:      ['idle', 'rush'],
          weasel:   ['idle', 'approach', 'dash'],
          hedgehog: ['idle', 'spike'],
          squirrel: ['idle', 'throw'],
          wolf:     ['chase', 'howl', 'aura'],
          fang:     ['chase', 'dash', 'stomp', 'rage'],
        }[proxy] ?? ['idle'];
        // 액션 매핑 — 비슷한 의미 키가 있으면 그것 사용
        const ACT_MAP = {
          'bat-swoop':         'rush',
          'boar-ready':        'idle',
          'boar-charge':       'chase',
          'spider-throw':      'throw',
          'bear-swipe':        'spike',
          'bear-rage':         'spike',
          'toad-spit':         'throw',
          'blackbear-slam':    'howl',
          'blackbear-roar':    'howl',
          'owlking-dive':      'dash',
          'owlking-screech':   'chase',
          'owlking-whirl':     'stomp',
          'owlking-rage':      'rage',
        };
        const target = ACT_MAP[`${name}-${a}`] ?? (proxyHas.includes(a) ? a : 'idle');
        // proxy 의 idle 키가 없는 경우(wolf, fang) 'chase' 로 fallback
        const fallbackIdle = proxyHas.includes('idle') ? 'idle' : 'chase';
        const finalAct = proxyHas.includes(target) ? target : fallbackIdle;
        this.load.image(`${name}-${a}`, `assets/enemies/${proxy}/${proxy}-${finalAct}.png`);
      });
    });
    // 부엉이왕 깃털 투사체 — placeholder 로 다람쥐 도토리 재사용
    this.load.image('owlking-feather', 'assets/enemies/squirrel/squirrel-acorn.png');
  }

  create() {
    this._generateTextures();
    this.scene.start('HubScene');
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
