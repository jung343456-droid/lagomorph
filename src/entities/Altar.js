/**
 * Altar (코어 제단) — 비밀방의 제단 분기(secret_cache, cacheSubtype='altar')에 등장하는 코어 소모 제단.
 * 제단 비밀방 진입 시 GameScene 의 room-entered 핸들러가 스폰, 그 방을 떠나면 정리.
 * 비밀방은 보물방/제단방/엘리트방이 각 1/3 — 제단은 매 층 보장되지 않고 확률적으로만 등장.
 *
 * 상호작용: 플레이어가 NEAR_R(70px) 이내로 진입하는 순간 `altar-open-requested` 발행
 *           (Shopkeeper 와 동일 가드 — 범위를 벗어났다 재진입할 때마다 재발행).
 * UI: UIScene.openAltar() 가 상점 오버레이를 재사용해 런 한정 강화 슬롯(kind:'upgrade')을 띄운다.
 *
 * 시각: 청록 마름모 받침(rectangle 45° — Arc 금지 규칙 준수) + ◆ 글리프 + 근접 프롬프트.
 */
import Phaser from 'phaser';

const NEAR_R = 70; // 근접 감지 반경 (px)

export default class Altar {
  constructor(scene, x, y) {
    this.scene  = scene;
    this.isNear = false;
    this.alive  = true;
    this.x = x;
    this.y = y;

    this.base = scene.add.rectangle(x, y, 30, 30, 0x16323a)
      .setStrokeStyle(2, 0x00e5ff).setAngle(45).setDepth(8);
    this.glyph = scene.add.text(x, y, '◆', {
      fontSize: '20px', color: '#00e5ff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9);
    this._pulse = scene.tweens.add({
      targets: [this.base, this.glyph], scaleX: 1.12, scaleY: 1.12,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    this.prompt = scene.add.text(x, y + 30, '◆ 제단 — 코어 강화', {
      fontSize: '11px', color: '#00e5ff', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9).setVisible(false);
  }

  update(player) {
    if (!this.alive) return;
    const d    = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const near = d < NEAR_R;
    if (near !== this.isNear) {
      this.isNear = near;
      if (this.prompt.active) this.prompt.setVisible(near);
      // 범위 진입(far → near) 순간에만 발행 — 가드는 이 분기 자체로 처리됨
      if (near) this.scene.events.emit('altar-open-requested');
    }
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this._pulse?.remove();
    if (this.base.active)   this.base.destroy();
    if (this.glyph.active)  this.glyph.destroy();
    if (this.prompt.active) this.prompt.destroy();
  }
}
