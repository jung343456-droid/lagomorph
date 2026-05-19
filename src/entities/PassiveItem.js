/**
 * 패시브 아이템 픽업
 * 수집 시 플레이어 스탯에 영구 배율 적용 (런 내 유지)
 */
const ITEM_SIZE = 18;

export const ITEM_DEFS = {
  wide_claws: {
    name:  '넓은 발톱',
    desc:  '근거리 공격 반경 ×1.33',
    color: 0xff8800,
    apply: (player) => { player.meleeRadiusMult += 0.33; },
  },
  sharp_claws: {
    name:  '예리한 발톱',
    desc:  '근거리 공격 데미지 ×1.20',
    color: 0x00ccff,
    apply: (player) => { player.meleeDamageMult += 0.20; },
  },
  poison_claws: {
    name:  '독성 발톱',
    desc:  '명중 시 10초 독 (0.5%/s, 최소 1)',
    color: 0xaa44ff,
    apply: (player) => { player.hasPoison = true; },
  },
  explosive_trap: {
    name:  '폭발 트랩',
    desc:  '트랩 명중 시 반경 40px 스플래시 15',
    color: 0xff4400,
    apply: (player) => { player.hasExplosiveTrap = true; },
  },
  frugal_instinct: {
    name:  '절약 본능',
    desc:  '트랩 코어 소모 3 → 2',
    color: 0xffdd00,
    apply: (player) => { player.trapCostBonus += 1; },
  },
  big_trap: {
    name:  '큰 볼일',
    desc:  '트랩 크기 ×2 (22 → 44px)',
    color: 0x885500,
    apply: (player) => { player.trapSizeMult *= 2; },
  },
};

export default class PassiveItem {
  constructor(scene, x, y, id) {
    this.scene = scene;
    this._id   = id;
    this._def  = ITEM_DEFS[id];
    this._alive = true;

    this.gameObject = scene.add.rectangle(x, y, ITEM_SIZE, ITEM_SIZE, this._def.color)
      .setDepth(7);

    scene.tweens.add({
      targets:  this.gameObject,
      scaleX:   1.35, scaleY: 1.35,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // 발광 링
    const gfx   = scene.add.graphics().setDepth(6);
    const state = { a: 0.45 };
    scene.tweens.add({
      targets: state, a: 0.05, duration: 700, yoyo: true, repeat: -1,
      onUpdate: () => {
        if (!this._alive) return;
        gfx.clear();
        gfx.lineStyle(2, this._def.color, state.a);
        gfx.strokeCircle(this.gameObject.x, this.gameObject.y, ITEM_SIZE * 1.6);
      },
    });
    this._glowGfx = gfx;
  }

  get x()     { return this.gameObject.x; }
  get y()     { return this.gameObject.y; }
  get alive() { return this._alive; }

  collect(player) {
    if (!this._alive) return;
    this._def.apply(player);
    player.inventory.push({ name: this._def.name, color: this._def.color, desc: this._def.desc });
    // 영속 해금 목록 갱신 (다음 런 시작 방 풀에 포함됨)
    const unlocked = PassiveItem.getUnlocked();
    if (!unlocked.includes(this._id)) {
      unlocked.push(this._id);
      try { localStorage.setItem('lagomorph_unlocked', JSON.stringify(unlocked)); } catch {}
    }
    this._showFloatText();
    this.dispose();
  }

  /** localStorage에서 한 번이라도 획득한 아이템 ID 배열 반환 */
  static getUnlocked() {
    try { return JSON.parse(localStorage.getItem('lagomorph_unlocked') || '[]'); } catch { return []; }
  }

  dispose() {
    if (!this._alive) return;
    this._alive = false;
    if (this._glowGfx?.active)   this._glowGfx.destroy();
    if (this.gameObject?.active) this.gameObject.destroy();
  }

  _showFloatText() {
    const txt = this.scene.add.text(
      this.gameObject.x, this.gameObject.y - 10,
      this._def.name,
      { fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
        stroke: '#000000', strokeThickness: 3 },
    ).setOrigin(0.5, 1).setDepth(60);

    this.scene.tweens.add({
      targets: txt,
      y:       txt.y - 44,
      alpha:   0,
      duration: 1200,
      ease:    'Quad.Out',
      onComplete: () => txt.destroy(),
    });
  }
}
