import Phaser from 'phaser';
import { HUD_H } from '../constants';

// 조이스틱 위치 — 화면 좌하단 고정
const JX = 90;
const JY_FROM_BOTTOM = 130;

// 반경
const TRAVEL_R = 50;    // 핸들 최대 이동 반경 (요구사항)
const BASE_R   = 58;    // 베이스 원 시각 반경 (여유분 8px)
const THUMB_R  = 22;    // 핸들 원 시각 반경

// 미세 떨림 무시
const DEAD_ZONE = 4;

export default class InputManager {
  constructor(scene) {
    this.scene = scene;
    this._dir = { x: 0, y: 0 };

    this._active    = false;
    this._pointerId = null;

    // 화면 좌표로 고정 위치 계산 (스케일 후 실제 캔버스 기준)
    this._jx = JX;
    // 터치 판정용: 캔버스 절대 y (포인터 좌표와 동일 좌표계)
    this._jy = scene.scale.height - JY_FROM_BOTTOM;
    // 그래픽 그리기용: GameScene 카메라가 HUD_H 만큼 viewport offset 을 가지므로 보정
    this._visualY = this._jy - HUD_H;

    this._createGfx();
    this._bindPointers();
    this._bindKeyboard();

    // scene.start(other) 로 씬 전환 시 listener 가 잔존해 다음 씬의 새 InputManager 와
    // pointerId 가 충돌 → 신규 인스턴스가 활성화되지 않는 사례를 차단한다.
    scene.events.once('shutdown', () => this.destroy());
    scene.events.once('destroy',  () => this.destroy());

    // scene.pause()(예: 상점 오픈) 중에는 pointerup 이 도달하지 않아 손을 떼도 active 상태가
    // 유지되어 unpause 후 이동/조준이 고정되는 버그가 있었음. pause·resume 시점에 강제 리셋.
    this._pauseReset = () => this._reset();
    scene.events.on('pause',  this._pauseReset);
    scene.events.on('resume', this._pauseReset);
  }

  // ── public ───────────────────────────────────────────

  /** 정규화 아날로그 방향 { x, y } — update() 마다 호출 */
  getDirection() {
    return this._active ? { x: this._dir.x, y: this._dir.y } : this._keyDir();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._baseGfx?.active)  this._baseGfx.destroy();
    if (this._thumbGfx?.active) this._thumbGfx.destroy();
    const i = this.scene.input;
    i.off('pointerdown', this._onDown, this);
    i.off('pointermove', this._onMove, this);
    i.off('pointerup',   this._onUp,   this);
    if (this._pauseReset) {
      this.scene.events.off('pause',  this._pauseReset);
      this.scene.events.off('resume', this._pauseReset);
      this._pauseReset = null;
    }
  }

  // ── private ──────────────────────────────────────────

  _createGfx() {
    const { _jx: x, _visualY: y } = this;

    // 베이스: 딤 채우기 + 테두리로 범위 표시
    this._baseGfx = this.scene.add
      .circle(x, y, BASE_R, 0xffffff, 0.07)
      .setStrokeStyle(1.5, 0xffffff, 0.25)
      .setScrollFactor(0)
      .setDepth(200);

    // 핸들
    this._thumbGfx = this.scene.add
      .circle(x, y, THUMB_R, 0x4ecca3, 0.8)
      .setScrollFactor(0)
      .setDepth(201);
  }

  _bindPointers() {
    const halfW = this.scene.scale.width / 2;

    this._onDown = (p) => {
      if (this._pointerId !== null) return;   // 이미 활성화된 포인터 있음
      if (p.x > halfW) return;                // 우측 화면은 액션 영역

      this._active    = true;
      this._pointerId = p.id;
      this._moveThumb(p.x, p.y);
    };

    this._onMove = (p) => {
      if (p.id !== this._pointerId) return;
      this._moveThumb(p.x, p.y);
    };

    this._onUp = (p) => {
      if (p.id !== this._pointerId) return;
      this._reset();
    };

    const i = this.scene.input;
    i.on('pointerdown', this._onDown, this);
    i.on('pointermove', this._onMove, this);
    i.on('pointerup',   this._onUp,   this);
  }

  /**
   * 포인터 위치 → 방향 벡터 + 핸들 시각 업데이트
   * 베이스 중심에서 포인터까지의 벡터를 TRAVEL_R로 클램프.
   */
  _moveThumb(px, py) {
    const dx   = px - this._jx;
    const dy   = py - this._jy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < DEAD_ZONE) {
      this._dir.x = 0;
      this._dir.y = 0;
      this._thumbGfx.setPosition(this._jx, this._visualY);
      return;
    }

    const clamped = Math.min(dist, TRAVEL_R);
    const angle   = Math.atan2(dy, dx);

    // 핸들 위치 — TRAVEL_R 반경 내에 클램프 (그래픽은 viewport-offset 보정된 y 사용)
    this._thumbGfx.setPosition(
      this._jx     + Math.cos(angle) * clamped,
      this._visualY + Math.sin(angle) * clamped,
    );

    // 아날로그: 거리에 비례한 크기 (0 ~ 1), 각도 기반 방향
    const magnitude  = clamped / TRAVEL_R;
    this._dir.x = Math.cos(angle) * magnitude;
    this._dir.y = Math.sin(angle) * magnitude;
  }

  _reset() {
    this._active    = false;
    this._pointerId = null;
    this._dir.x     = 0;
    this._dir.y     = 0;
    this._thumbGfx.setPosition(this._jx, this._visualY);
  }

  _bindKeyboard() {
    this._cursors = this.scene.input.keyboard.createCursorKeys();
    this._wasd    = this.scene.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
  }

  /** 조이스틱 미사용 시 키보드 방향 반환 (데스크탑 테스트용) */
  _keyDir() {
    let x = 0, y = 0;
    if (this._cursors.left.isDown  || this._wasd.left.isDown)  x -= 1;
    if (this._cursors.right.isDown || this._wasd.right.isDown) x += 1;
    if (this._cursors.up.isDown    || this._wasd.up.isDown)    y -= 1;
    if (this._cursors.down.isDown  || this._wasd.down.isDown)  y += 1;
    if (x !== 0 && y !== 0) { x *= 0.7071; y *= 0.7071; }
    return { x, y };
  }
}
