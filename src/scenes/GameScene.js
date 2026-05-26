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
import Shopkeeper from '../entities/Shopkeeper';
import { getMetaCores } from '../data/MetaProgress';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // scene.restart() 시 Phaser 3.60 은 이 씬의 이벤트 리스너를 자동 정리하지 않는다.
    // 이 씬에서 등록한 사용자 이벤트들을 명시적으로 비워야 listener 중복 등록을 막을 수 있다.
    ['boss-cleared', 'floor-exit-ready', 'room-entered', 'shop-open-requested', 'floor-changed']
      .forEach(e => this.events.off(e));

    this.player        = new Player(this, ROOM_W / 2, ROOM_H / 2);
    this.input$        = new InputManager(this);
    this.enemyManager  = new EnemyManager(this, this.player);
    this.attackManager = new AttackManager(this, this.player);

    this.currentFloor = 1;

    // 던전 생성 → 첫 방 진입
    this.roomManager = new RoomManager(this, this.player, this.enemyManager);
    this.roomManager.setFloor(this.currentFloor);
    this.roomManager.init(generateDungeon(this.currentFloor, undefined, this._ownedItemIds()));

    // 상점방 NPC (현재 방이 'shop' 일 때만 살아 있음)
    this._shopkeeper = null;

    // 시작 방 — 이전 런에서 한 번이라도 획득한 아이템 중 랜덤 1개
    this._passiveItems = [];
    this._spawnStartRoomItem();

    // 계단 상태 (아래층 진입 트리거)
    this._stairs           = null;
    this._stairsRoomId     = null;
    this._stairsPos        = null;
    this._stairsTriggered  = false;

    // 엔드 스크린 — scene.restart() 시 게임 오브젝트는 파괴되지만 인스턴스 프로퍼티는 잔존하므로 명시 리셋
    this._endScreenEls    = null;
    // 런 시작 시점의 메타 코어 잔량 — 종료 화면에서 "이번 런 적립" 차분 표시용
    this._runStartMeta    = getMetaCores();

    // 보스 클리어: 랜덤 아이템 드롭(보유 패시브 + 미수집 월드 아이템 제외) + 계단 표시(층1~4) / 구역 클리어(층5)
    this.events.on('boss-cleared', ({ x, y, floor, roomId }) => {
      const excluded = new Set([
        ...this._ownedItemIds(),
        ...this._passiveItems.filter(i => i.alive).map(i => i.id),
      ]);
      const dropable = Object.keys(ITEM_DEFS).filter(id => !excluded.has(id));
      if (dropable.length > 0) {
        const id = dropable[Math.floor(Math.random() * dropable.length)];
        this._passiveItems.push(new PassiveItem(this, x, y, id));
      }
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
      if (this._stairsRoomId !== null) {
        const inStairsRoom = roomData.id === this._stairsRoomId;
        if (inStairsRoom && !this._stairs) {
          this._spawnStairs(this._stairsPos.x, this._stairsPos.y);
        } else if (!inStairsRoom && this._stairs) {
          this._disposeStairs();
        }
      }

      // 상점방 NPC 라이프사이클 — 방 바뀔 때마다 기존 NPC 정리 후 필요 시 재생성
      if (this._shopkeeper) { this._shopkeeper.dispose(); this._shopkeeper = null; }
      if (roomData.type === 'shop') {
        this._shopkeeper = new Shopkeeper(
          this, ROOM_W / 2, ROOM_H * 0.32, roomData.shopSlots,
        );
      }
    });

    // 상점 열기 요청 (AttackManager 가 NPC 근접 시 B 버튼 → 발행)
    this.events.on('shop-open-requested', () => {
      if (!this._shopkeeper) return;
      const ui = this.scene.get('UIScene');
      ui.openShop?.(this._shopkeeper.shopSlots);
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
      this.time.delayedCall(400, () => this._showGameOver());
    });
  }

  _showGameOver() {
    this._buildRunSummary({
      title:      'GAME OVER',
      titleColor: '#ff4444',
      subtitle:   null,
      showCause:  true,
    });
  }

  _showZoneClear() {
    this._buildRunSummary({
      title:      'ZONE 1 CLEAR',
      titleColor: '#4ecca3',
      subtitle:   '구역 1 클리어!',
      showCause:  false,
    });
  }

  /**
   * GAME OVER / ZONE CLEAR 공통 결과 요약 화면.
   * - 타이틀 + (선택) 부제
   * - 사망 위치: "구역 1 - N층"
   * - (GAME OVER) 사망 원인: 마지막 가해자 displayName
   * - 결과: 이번 런 픽업/메타 적립/남은 코어/누적 메타
   * - 획득한 아이템 그리드 (2열)
   * - 단일 "허브로 돌아가기" 버튼
   */
  _buildRunSummary({ title, titleColor, subtitle, showCause }) {
    this._endScreenEls = [];
    const push = (...els) => this._endScreenEls.push(...els);
    const pickedCores = getMetaCores() - this._runStartMeta;
    const totalMeta   = getMetaCores();
    const runCores    = this.enemyManager.coreCount;
    const cause       = this.player.lastDamageSource ?? '원인 미상';
    const inv         = this.player.inventory ?? [];

    // 풀스크린 백드롭
    push(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.82)
      .setScrollFactor(0).setDepth(100).setOrigin(0));

    // 타이틀 (+ 부제)
    let y = 76;
    push(this.add.text(GAME_W / 2, y, title, {
      fontSize: title.length > 10 ? '26px' : '34px',
      color: titleColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
    y += 30;
    if (subtitle) {
      push(this.add.text(GAME_W / 2, y, subtitle, {
        fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
      y += 22;
    }

    // 사망 위치
    push(this.add.text(GAME_W / 2, y, `구역 1  ·  ${this.currentFloor}층`, {
      fontSize: '13px', color: '#cccccc', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
    y += 22;

    // 사망 원인 (GAME OVER 전용)
    if (showCause) {
      push(this.add.text(GAME_W / 2, y, `사망 원인  ·  ${cause}`, {
        fontSize: '13px', color: '#ff8888', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
      y += 22;
    }

    y += 8;
    push(this._sep(y));
    y += 14;

    // 결과 요약 — 좌측 라벨, 우측 값
    const labelX = GAME_W / 2 - 90;
    const valueX = GAME_W / 2 + 90;
    const lines = [
      { label: '이번 런 픽업',   value: `◆ ${pickedCores}`, valueColor: '#ffe9bb' },
      { label: '메타 적립',       value: `+${pickedCores}`,  valueColor: '#ffcc44' },
      { label: '남은 런 코어',    value: `◆ ${runCores}`,    valueColor: '#aaaaaa' },
      { label: '누적 메타',       value: `◆ ${totalMeta}`,   valueColor: '#4ecca3' },
    ];
    lines.forEach(({ label, value, valueColor }) => {
      push(this.add.text(labelX, y, label, {
        fontSize: '12px', color: '#888888', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101));
      push(this.add.text(valueX, y, value, {
        fontSize: '13px', color: valueColor, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(101));
      y += 22;
    });

    y += 6;
    push(this._sep(y));
    y += 14;

    // 획득한 아이템 헤더
    push(this.add.text(GAME_W / 2, y, `획득한 아이템 (${inv.length})`, {
      fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
    y += 22;

    // 아이템 2열 그리드
    if (inv.length === 0) {
      push(this.add.text(GAME_W / 2, y, '없음', {
        fontSize: '12px', color: '#555555', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
      y += 22;
    } else {
      const colX  = [GAME_W / 2 - 90, GAME_W / 2 + 10];
      const rowH  = 22;
      inv.forEach((item, i) => {
        const cx  = colX[i % 2];
        const cy  = y + Math.floor(i / 2) * rowH;
        push(this.add.rectangle(cx, cy, 12, 12, item.color)
          .setScrollFactor(0).setDepth(101));
        push(this.add.text(cx + 12, cy, item.name, {
          fontSize: '12px', color: '#dddddd', fontFamily: 'monospace',
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101));
      });
      y += Math.ceil(inv.length / 2) * rowH;
    }

    // 허브로 돌아가기 버튼 (화면 하단 고정)
    const btnY = GAME_H - 80;
    const btn = this.add.rectangle(GAME_W / 2, btnY, 220, 46, 0x222222)
      .setStrokeStyle(2, 0x4ecca3).setScrollFactor(0).setDepth(101)
      .setInteractive({ cursor: 'pointer' });
    const btnTxt = this.add.text(GAME_W / 2, btnY, '허브로 돌아가기', {
      fontSize: '16px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    btn.on('pointerdown', () => {
      this.scene.stop('UIScene');
      this.scene.start('HubScene');
    });
    btn.on('pointerover', () => btn.setFillStyle(0x2a2a2a));
    btn.on('pointerout',  () => btn.setFillStyle(0x222222));
    push(btn, btnTxt);
  }

  _sep(y) {
    return this.add.rectangle(GAME_W / 2, y, GAME_W - 80, 1, 0x444444, 0.6)
      .setScrollFactor(0).setDepth(101);
  }

  _spawnStartRoomItem() {
    const owned    = new Set(this._ownedItemIds());
    const unlocked = PassiveItem.getUnlocked().filter(id => !owned.has(id));
    if (unlocked.length > 0) {
      const id = unlocked[Math.floor(Math.random() * unlocked.length)];
      this._passiveItems.push(new PassiveItem(this, ROOM_W / 2 + 80, ROOM_H / 2, id));
    }
  }

  /** 현재 보유한 패시브 id 목록 — 상점 슬롯·보스 드롭 제외 필터에 사용 */
  _ownedItemIds() {
    return (this.player?.inventory ?? []).map(i => i.id).filter(Boolean);
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
      if (this._shopkeeper) { this._shopkeeper.dispose(); this._shopkeeper = null; }
      this.enemyManager.clearAll();
      this.roomManager.setFloor(this.currentFloor);
      this.roomManager.init(generateDungeon(this.currentFloor, undefined, this._ownedItemIds()));
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

  update(_time, delta) {
    this.player.update(this.input$.getDirection(), delta);
    this.attackManager.update(delta);
    this.enemyManager.update(delta);
    this.roomManager.update();
    if (this._shopkeeper) this._shopkeeper.update(this.player);

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
