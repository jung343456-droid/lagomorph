/**
 * MemoryTape ('누군가의 기억') — 비디오 테이프 오브젝트. 두 곳에서 같은 비주얼로 등장한다.
 *
 *   - HubScene 우측: 탭(opts.onTap) 시 발견한 기억 보관실 목록 메뉴
 *   - 기억 보관실(ENGRAM VAULT) 중앙: 가까이 가면(opts.onApproach) 그 보관실 대사 재생
 *
 * 상호작용:
 *   - opts.onApproach: 플레이어가 nearR 이내로 들어오는 far→near 엣지에서 1회 호출.
 *     범위를 벗어났다 다시 들어오면 재호출 — "가까이 갈 때마다" 대사 재생.
 *   - opts.onTap: 본체 탭(pointerdown) 시 호출. 거리 무시.
 *   - opts.promptText: 있으면 근접 시 점멸 프롬프트 노출.
 *   - opts.nearR: 근접 감지 반경(기본 64px).
 *
 * 시각: Arc 금지 규칙 준수 — 본체·릴 창 모두 rectangle.
 */
import Phaser from 'phaser';

const TAPE_W         = 30;  // 기존 60에서 50% 축소
const TAPE_H         = 19;  // 기존 38에서 50% 축소
const TAPE_COLOR     = 0x241a2e;
const TAPE_GLOW      = 0xaa66ff;
const DEFAULT_NEAR_R = 64;

export default class MemoryTape {
  constructor(scene, x, y, opts = {}) {
    this.scene  = scene;
    this.x = x;
    this.y = y;
    this.alive  = true;
    this.isNear = false;
    this._nearR      = opts.nearR ?? DEFAULT_NEAR_R;
    this._onApproach = opts.onApproach ?? null;
    this._els = [];

    // 발광 테두리 — 호흡 트윈으로 살아있다는 인상
    this.glow = scene.add.rectangle(x, y, TAPE_W + 3, TAPE_H + 3)
      .setStrokeStyle(1, TAPE_GLOW, 0.5).setDepth(7);
    this._pulse = scene.tweens.add({
      targets: this.glow, scaleX: 1.05, scaleY: 1.05,
      duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // 카세트 본체
    const body = scene.add.rectangle(x, y, TAPE_W, TAPE_H, TAPE_COLOR)
      .setStrokeStyle(1, 0x5a3a7e).setDepth(8);
    // 상단 라벨 띠
    const band = scene.add.rectangle(x, y - TAPE_H / 2 + 4, TAPE_W - 5, 4, 0x3a2a4e).setDepth(9);
    // 두 릴 창 (장식)
    const reelL = scene.add.rectangle(x - 6, y + 1.5, 6, 6, 0x0c0814).setStrokeStyle(1, 0x6a4a8e).setDepth(9);
    const reelR = scene.add.rectangle(x + 6, y + 1.5, 6, 6, 0x0c0814).setStrokeStyle(1, 0x6a4a8e).setDepth(9);

    this.body = body;
    this._els.push(this.glow, body, band, reelL, reelR);

    // 탭 상호작용 (옵션) — 거리 무시
    if (opts.onTap) {
      body.setInteractive({ cursor: 'pointer' });
      body.on('pointerdown', opts.onTap);
    }

    // 근접 프롬프트 (옵션)
    this.prompt = null;
    if (opts.promptText) {
      this.prompt = scene.add.text(x, y + TAPE_H / 2 + 20, opts.promptText, {
        fontSize: '11px', color: '#bb88ff', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(10).setVisible(false);
      this._promptTween = scene.tweens.add({
        targets: this.prompt, alpha: 0.6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
      this._els.push(this.prompt);
    }
  }

  update(player) {
    if (!this.alive) return;
    const d    = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const near = d < this._nearR;
    if (near !== this.isNear) {
      this.isNear = near;
      if (this.prompt?.active) this.prompt.setVisible(near);
      // 범위 진입(far → near) 순간에만 호출 — 가드는 이 분기 자체로 처리됨
      if (near && this._onApproach) this._onApproach();
    }
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this._pulse?.remove();
    this._promptTween?.remove();
    for (const el of this._els) { if (el?.active) el.destroy(); }
    this._els = [];
  }
}
