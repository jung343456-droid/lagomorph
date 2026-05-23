/**
 * Shopkeeper (GRIM) — 잿빛털 토끼 상인 NPC
 * 상점방(`roomData.type === 'shop'`)에 1마리, 방 중앙 상단(`y ≈ ROOM_H * 0.32`) 배치.
 *
 * 상호작용: 플레이어가 NEAR_R(60px) 이내 진입 시 머리 위 ▼ + "B로 상점 열기" 힌트 표시.
 *           이 상태에서 B/X 입력 시 AttackManager._startPlace()가 트랩 대신
 *           `shop-open-requested` 이벤트 발행 (AttackManager 측에서 isNear 확인).
 *
 * 텍스처: 'grim' (BootScene._generateTextures에서 프로그래밍 생성). 없으면 회색 rectangle 폴백.
 * 정리: 방 전환·층 전환·재시작 시 GameScene이 dispose() 호출.
 */
import Phaser from 'phaser';

const NEAR_R     = 60;   // 근접 감지 반경 (px)
const DISPLAY_W  = 40;
const DISPLAY_H  = 50;

export default class Shopkeeper {
  constructor(scene, x, y, shopSlots) {
    this.scene     = scene;
    this.shopSlots = shopSlots;
    this.isNear    = false;
    this.alive     = true;

    if (scene.textures.exists('grim')) {
      this.gameObject = scene.add.image(x, y, 'grim').setDepth(8);
      this.gameObject.setDisplaySize(DISPLAY_W, DISPLAY_H);
    } else {
      this.gameObject = scene.add.rectangle(x, y, DISPLAY_W, DISPLAY_H, 0x8a8a86).setDepth(8);
    }

    // 호흡 트윈 (작게 위아래 스케일)
    this._breath = scene.tweens.add({
      targets:  this.gameObject,
      scaleY:   { from: this.gameObject.scaleY, to: this.gameObject.scaleY * 1.05 },
      duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // 힌트 (근접 시 표시)
    this._hintArrow = scene.add.text(x, y - 36, '▼', {
      fontSize: '16px', color: '#ffcc66', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(9).setVisible(false);

    this._hintText = scene.add.text(x, y - 54, 'B로 상점 열기', {
      fontSize: '11px', color: '#ddccaa', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9).setVisible(false);

    this._hintBob = scene.tweens.add({
      targets:  this._hintArrow,
      y:        y - 30,
      duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  update(player) {
    if (!this.alive) return;
    const d    = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const near = d < NEAR_R;
    if (near !== this.isNear) {
      this.isNear = near;
      this._hintArrow.setVisible(near);
      this._hintText.setVisible(near);
    }
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this._breath?.remove();
    this._hintBob?.remove();
    if (this.gameObject?.active) this.gameObject.destroy();
    if (this._hintArrow?.active) this._hintArrow.destroy();
    if (this._hintText?.active)  this._hintText.destroy();
  }
}
