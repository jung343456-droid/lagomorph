/**
 * Shopkeeper (GRIM) — 잿빛털 토끼 상인 NPC
 * 상점방(`roomData.type === 'shop'`)에 1마리, 방 중앙 상단(`y ≈ ROOM_H * 0.32`) 배치.
 *
 * 상호작용: 플레이어가 NEAR_R(85px) 이내로 진입하는 순간 `shop-open-requested` 이벤트 발행.
 *           범위 안에서 이동 중에는 재발행되지 않고, 범위를 벗어났다가 다시 들어올 때마다 재발행.
 *
 * 탁자: 상인 앞(아래쪽) 정적 obstacle 사각형. 플레이어와 충돌. NEAR_R은 탁자 너머에서 트리거되도록 보정됨.
 *
 * 텍스처: 'grim' (BootScene._generateTextures에서 프로그래밍 생성). 없으면 회색 rectangle 폴백.
 * 정리: 방 전환·층 전환·재시작 시 GameScene이 dispose() 호출.
 */
import Phaser from 'phaser';

const NEAR_R     = 85;   // 근접 감지 반경 (px) — 탁자 너머에서도 트리거되도록 보정
const DISPLAY_W  = 40;
const DISPLAY_H  = 50;

const TABLE_W       = 56;
const TABLE_H       = 14;
const TABLE_GAP     = 4;   // 상인 몸체 하단과 탁자 상단 사이 여백
const TABLE_COLOR   = 0x6b4226;
const TABLE_STROKE  = 0x3d2615;

export default class Shopkeeper {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Array|null} shopSlots  상점 슬롯 (Hub 의 해금 NPC 는 null 전달)
   * @param {string} [interactEvent='shop-open-requested']  근접 시 발행할 씬 이벤트
   */
  constructor(scene, x, y, shopSlots, interactEvent = 'shop-open-requested') {
    this.scene         = scene;
    this.shopSlots     = shopSlots;
    this.interactEvent = interactEvent;
    this.isNear        = false;
    this.alive         = true;

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

    // 탁자 — 상인 바로 앞(아래) 정적 obstacle
    const tableY = y + DISPLAY_H / 2 + TABLE_GAP + TABLE_H / 2;
    this._table = scene.add.rectangle(x, tableY, TABLE_W, TABLE_H, TABLE_COLOR)
      .setStrokeStyle(2, TABLE_STROKE)
      .setDepth(8);
    scene.physics.add.existing(this._table, true);
    if (scene.player?.gameObject) {
      this._tableCollider = scene.physics.add.collider(scene.player.gameObject, this._table);
    }
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  update(player) {
    if (!this.alive) return;
    const d    = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const near = d < NEAR_R;
    if (near !== this.isNear) {
      this.isNear = near;
      // 범위 진입(far → near) 순간에만 이벤트 발행 — 범위 내 이동·재진입까지 가드는 이 분기 자체로 처리됨
      if (near) this.scene.events.emit(this.interactEvent);
    }
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this._breath?.remove();
    if (this._tableCollider) { this._tableCollider.destroy(); this._tableCollider = null; }
    if (this._table?.active)  this._table.destroy();
    if (this.gameObject?.active) this.gameObject.destroy();
  }
}
