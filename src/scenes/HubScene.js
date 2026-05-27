/**
 * HubScene — 허브 / 시작 방. 런과 런 사이에 머무는 영속 공간.
 *
 * 배치:
 *   - 중앙: 토끼가 잠들어있는 기상 기계 (탭/근접 시 런 시작)
 *   - 좌측(상점 한 번 이상 발견 시): GRIM NPC — 근접 시 영구 해금 메뉴 오픈
 *   - 상단: 메타 코어 잔량 표시
 *
 * 흐름:
 *   BootScene → HubScene → (기상 기계 작동) → GameScene → (사망/클리어) → HubScene
 *
 * GameScene 과 달리 AttackManager·EnemyManager 는 생성하지 않는다 (전투 없음).
 * 단일 방이므로 RoomManager 대신 Room 인스턴스를 직접 다룬다.
 */

import Phaser from 'phaser';
import { GAME_W, GAME_H, HUD_H } from '../constants';
import Player from '../entities/Player';
import InputManager from '../utils/InputManager';
import Shopkeeper from '../entities/Shopkeeper';
import Room, { ROOM_W, ROOM_H } from '../world/Room';
import UnlockMenu from '../ui/UnlockMenu';
import { getMetaCores, getShopDiscovered } from '../data/MetaProgress';

const MACHINE_W       = 110;
const MACHINE_H       = 140;
const MACHINE_TRIG_R  = 70;   // 이 거리 이내로 들어오면 "탭하여 시작" 프롬프트 노출
const MACHINE_COLOR   = 0x161a2e;
const MACHINE_GLOW    = 0x4ecca3;
const WINDOW_W        = 78;
const WINDOW_H        = 96;
const WINDOW_COLOR    = 0x0c1118;

const NPC_X_FROM_LEFT = 100; // 좌측 NPC 배치 x
const NPC_Y_FACTOR    = 0.30; // ROOM_H * 비율

const PLAYER_START_Y_FACTOR = 0.78; // 하단에서 시작

export default class HubScene extends Phaser.Scene {
  constructor() { super({ key: 'HubScene' }); }

  create() {
    // 이벤트 잔존 방지 (scene.start 로 재진입 시)
    ['unlock-menu-requested', 'hub-start-run'].forEach(e => this.events.off(e));

    // 단일 방 — 문 없음, 장애물 없음. Room 이 데이터에 의존하므로 더미 형태로 전달.
    this._roomData = {
      type: 'hub',
      doors: { up: null, down: null, left: null, right: null },
      obstacleLayout: [],
    };
    this._room = new Room(this, this._roomData);

    // 카메라 — GameScene 과 동일하게 HUD_H 만큼 위쪽 viewport 비움
    this.cameras.main.setViewport(0, HUD_H, GAME_W, GAME_H - HUD_H);
    this.cameras.main.setBounds(0, 0, ROOM_W, ROOM_H);
    this.cameras.main.setScroll(0, 0);
    this.physics.world.setBounds(0, 0, ROOM_W, ROOM_H);

    // 플레이어 (이전 런 정보 없음 — 새 인스턴스. applyUnlocksToPlayer 효과는 적용되지만 전투 없으므로 영향 없음)
    this.player = new Player(this, ROOM_W / 2, ROOM_H * PLAYER_START_Y_FACTOR);
    // 벽 콜라이더 — 플레이어가 방을 벗어나지 않게
    this.physics.add.collider(this._room.wallGroup, this.player.gameObject);

    // 조이스틱 / 키보드
    this.input$ = new InputManager(this);

    // 중앙 기상 기계
    this._buildMachine();

    // 메타 코어 상단 표시 (HUD 영역 위쪽 절반)
    this._buildHud();

    // 상점 한 번이라도 발견 → Hub NPC 등장
    this._shopkeeper = null;
    if (getShopDiscovered()) {
      this._shopkeeper = new Shopkeeper(
        this, NPC_X_FROM_LEFT, ROOM_H * NPC_Y_FACTOR, null, 'unlock-menu-requested',
      );
    }

    // 해금 메뉴 — Shopkeeper 가 근접 시 발행 / 또는 직접 호출
    this._unlockMenu = null;
    this.events.on('unlock-menu-requested', () => this._openUnlockMenu());

    // 런 시작 요청 — 기상 기계 탭 또는 X(B) 키
    this.events.on('hub-start-run', () => this._startRun());
    this.input.keyboard.on('keydown-X', () => {
      if (this._machinePromptActive) this._startRun();
    });

    // 진입 페이드 인
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  update(_time, delta) {
    if (this._starting) return;
    this.player.update(this.input$.getDirection(), delta);
    if (this._shopkeeper) this._shopkeeper.update(this.player);

    // 기상 기계 근접 프롬프트 토글
    const d = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this._machineX, this._machineY,
    );
    const near = d < MACHINE_TRIG_R;
    if (near !== this._machinePromptActive) {
      this._machinePromptActive = near;
      this._machinePrompt.setVisible(near);
      this._machineGlow.setStrokeStyle(near ? 3 : 2, MACHINE_GLOW, near ? 1 : 0.55);
    }

    // HUD 메타 코어 표시 동기화 (해금 구매로 잔량이 바뀔 수 있음)
    if (this._metaText && !this._unlockMenu) {
      this._metaText.setText(`◆ ${getMetaCores()}`);
    }
  }

  // ── private ─────────────────────────────────────────

  _buildMachine() {
    const cx = ROOM_W / 2;
    const cy = ROOM_H / 2;
    this._machineX = cx;
    this._machineY = cy;

    // 외곽 — 기계 본체 (어두운 메탈)
    const body = this.add.rectangle(cx, cy, MACHINE_W, MACHINE_H, MACHINE_COLOR)
      .setStrokeStyle(3, 0x3a3a5e).setDepth(4);
    // 발광 테두리 — 호흡 트윈으로 살아있다는 인상
    this._machineGlow = this.add.rectangle(cx, cy, MACHINE_W + 6, MACHINE_H + 6)
      .setStrokeStyle(2, MACHINE_GLOW, 0.55).setDepth(3);
    this.tweens.add({
      targets: this._machineGlow,
      scaleX: 1.04, scaleY: 1.04,
      duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // 내부 윈도우 — 잠들어있는 토끼가 보이는 영역
    this.add.rectangle(cx, cy - 6, WINDOW_W, WINDOW_H, WINDOW_COLOR)
      .setStrokeStyle(2, 0x1a2a3a).setDepth(5);

    // 잠든 토끼 (soma-bottom 텍스처 — 살짝 어둡게)
    const sleeper = this.add.image(cx, cy + 2, 'soma-bottom')
      .setDisplaySize(44, 50).setDepth(6).setAlpha(0.75).setTint(0xaaaaff);
    this.tweens.add({
      targets: sleeper,
      y: cy + 4,
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // Zzz 텍스트 — 살짝 떠다님
    const zzz = this.add.text(cx + 18, cy - 32, 'z z Z', {
      fontSize: '14px', color: '#88aaff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(6).setAlpha(0.85);
    this.tweens.add({
      targets: zzz,
      y: cy - 40, alpha: 0.4,
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // 하단 컨트롤 패널 (장식)
    this.add.rectangle(cx, cy + MACHINE_H / 2 - 12, MACHINE_W - 20, 14, 0x222a40)
      .setStrokeStyle(1, 0x3a4a60).setDepth(5);
    this.add.rectangle(cx - 18, cy + MACHINE_H / 2 - 12, 6, 6, 0xff5555).setDepth(6);
    this.add.rectangle(cx + 0,  cy + MACHINE_H / 2 - 12, 6, 6, 0xffcc44).setDepth(6);
    this.add.rectangle(cx + 18, cy + MACHINE_H / 2 - 12, 6, 6, 0x4ecca3).setDepth(6);

    // 탭 영역 (기계 클릭) — pointerdown 으로 런 시작 트리거
    body.setInteractive({ cursor: 'pointer' });
    body.on('pointerdown', () => {
      // 근접 상태에서만 시작 — 멀리서 탭해도 같이 가도록 거리 무시
      this.events.emit('hub-start-run');
    });

    // 근접 시 표시되는 프롬프트
    this._machinePrompt = this.add.text(cx, cy + MACHINE_H / 2 + 28,
      '▶ 탭 또는 X — 시작', {
        fontSize: '14px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(7).setVisible(false);
    this.tweens.add({
      targets: this._machinePrompt,
      alpha: 0.6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    this._machinePromptActive = false;
  }

  _buildHud() {
    // 상단 HUD 영역 (카메라 viewport 위쪽). scrollFactor 0 → 카메라 무시.
    // viewport offset 보정을 위해 절대 y 좌표 사용. HUD_H 만큼 영역이 있음.
    this.add.rectangle(0, 0, GAME_W, HUD_H, 0x0a0a14, 0.85)
      .setOrigin(0).setScrollFactor(0).setDepth(50);
    this.add.text(GAME_W / 2, 18, 'HUB', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace', fontStyle: 'bold',
      letterSpacing: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    this._metaText = this.add.text(GAME_W / 2, 48, `◆ ${getMetaCores()}`, {
      fontSize: '20px', color: '#ffcc44', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
  }

  _openUnlockMenu() {
    if (this._unlockMenu?.alive) return;
    this._unlockMenu = new UnlockMenu(this, () => {
      this._unlockMenu = null;
      // 닫힌 직후 플레이어가 여전히 NPC 근접 범위 안이면, Shopkeeper.update 의 far→near 엣지에서
      // 'unlock-menu-requested' 가 다시 발행되어 메뉴가 즉시 재오픈되는 버그가 있었음.
      // isNear=true 로 두어 "이미 진입한 상태" 로 간주 → 한 번 멀어졌다 다시 와야만 재오픈.
      if (this._shopkeeper) this._shopkeeper.isNear = true;
      // 메타 잔량 즉시 동기화
      if (this._metaText?.active) this._metaText.setText(`◆ ${getMetaCores()}`);
    });
  }

  _startRun() {
    if (this._starting) return;
    this._starting = true;
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene');
    });
  }
}
