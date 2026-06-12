/**
 * 패시브 아이템 픽업 — 총 23종
 * 수집 시 플레이어 스탯에 영구 적용 (런 내 유지), 획득 이력 localStorage 저장
 *
 * 근거리 강화: wide_claws(반경), sharp_claws(데미지), quick_claws(충전속도)
 * 근거리 상태이상: poison_claws(독), fire_claws(화상), ice_claws(빙결), thunder_claws(연쇄)
 * 치명타: cruel_claws(치명타율), precision_strike(둘 다), savage_strike(위력),
 *         blood_feast(치명 회복)
 * 이동/생존: swift_feet(이동속도), tough_hide(최대HP), hunter_instinct(킬회복),
 *           bulletproof_vest(방어력)
 * 트랩 위장(스플래시+상태이상): fire_disguise(화상), ice_disguise(빙결), poison_disguise(중독)
 * 트랩 강화: frugal_instinct(코어소모↓), big_trap(크기)
 * 탐색/편의: map_sense(전체 지도 공개), secret_sense(비밀 벽 가시화), core_affinity(방 클리어 시 코어 자동 수집)
 *
 * 스폰 규칙:
 *   시작 방 — 해금된 아이템 중 랜덤 1개 (첫 런은 미스폰)
 *             '기억 단편화' 해금 시 player.extraStartItems 만큼 추가 (GameScene._spawnStartRoomItem)
 *   보스 클리어 — ITEM_DEFS 전체 랜덤 1개 드롭
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
    desc:  '명중 시 25% 확률로 10초 독',
    color: 0xaa44ff,
    apply: (player) => { player.hasPoison = true; },
  },
  fire_claws: {
    name:  '화염 발톱',
    desc:  '명중 시 25% 확률로 3초 화상',
    color: 0xff2200,
    apply: (player) => { player.hasFire = true; },
  },
  ice_claws: {
    name:  '얼음 발톱',
    desc:  '명중 시 25% 확률로 3초 빙결',
    color: 0x88ddff,
    apply: (player) => { player.hasIce = true; },
  },
  swift_feet: {
    name:  '질주 발',
    desc:  '이동속도 +40',
    color: 0x00ee66,
    apply: (player) => { player.speed += 40; player.baseSpeed += 40; },
  },
  tough_hide: {
    name:  '강인한 가죽',
    desc:  '최대 HP +50',
    color: 0xff4455,
    apply: (player) => { player.maxHp += 50; player.heal(50); },
  },
  bulletproof_vest: {
    name:  '방탄조끼',
    desc:  '방어력 +2 — 받는 피해 -2 (방어력 이하 공격은 무효)',
    color: 0x445566,
    apply: (player) => { player.armor += 2; },
  },
  quick_claws: {
    name:  '민첩한 발톱',
    desc:  '근거리 충전 속도 ×1.5',
    color: 0xffee00,
    apply: (player) => { player.chargeSpeedMult *= 1.5; },
  },
  thunder_claws: {
    name:  '감전 발톱',
    desc:  '명중 시 25% 확률로 반경 150px 내 적에게 연쇄',
    color: 0xddff22,
    apply: (player) => { player.hasThunder = true; },
  },
  hunter_instinct: {
    name:  '사냥꾼의 본능',
    desc:  '적 처치 시 HP 3 회복',
    color: 0xff6688,
    apply: (player) => { player.healOnKill += 3; },
  },
  fire_disguise: {
    name:  '불꽃 위장',
    desc:  '트랩 명중 시 반경 40px 스플래시 15 + 50% 확률 화상',
    color: 0xff5522,
    apply: (player) => { player.hasFireDisguise = true; },
  },
  ice_disguise: {
    name:  '냉동 위장',
    desc:  '트랩 명중 시 반경 40px 스플래시 15 + 50% 확률 빙결',
    color: 0x66ccff,
    apply: (player) => { player.hasIceDisguise = true; },
  },
  poison_disguise: {
    name:  '독성 위장',
    desc:  '트랩 명중 시 반경 40px 스플래시 15 + 50% 확률 중독',
    color: 0x88dd44,
    apply: (player) => { player.hasPoisonDisguise = true; },
  },
  frugal_instinct: {
    name:  '절약 본능',
    desc:  '트랩 코어 소모 3 → 2',
    color: 0xffdd00,
    apply: (player) => { player.trapCostBonus += 1; },
  },
  big_trap: {
    name:  '대식가',
    desc:  '트랩 크기 ×2 (22 → 44px), 회복 아이템 효과 +10%',
    dynDesc: (p) => { const cur = Math.round(22 * (p.trapSizeMult ?? 1)); return `트랩 크기 ×2 (${cur} → ${cur * 2}px), 회복 아이템 효과 +10%`; },
    color: 0x885500,
    apply: (player) => {
      player.trapSizeMult *= 2;
      player.healItemMult += 0.1;
    },
  },
  cruel_claws: {
    name:  '잔혹한 발톱',
    desc:  '치명타율 +15% (15 → 30%)',
    dynDesc: (p) => `치명타율 +15% (${Math.round(p.critRate * 100)} → ${Math.round((p.critRate + 0.15) * 100)}%)`,
    color: 0xcc1144,
    apply: (player) => { player.critRate += 0.15; },
  },
  precision_strike: {
    name:  '정밀 일격',
    desc:  '치명타율 +10%, 치명타 피해 +50%',
    color: 0xddcc22,
    apply: (player) => { player.critRate += 0.10; player.critMult += 0.5; },
  },
  savage_strike: {
    name:  '광폭한 일격',
    desc:  '치명타 피해 +100% (×1.5 → ×2.5)',
    dynDesc: (p) => `치명타 피해 +100% (×${p.critMult.toFixed(1)} → ×${(p.critMult + 1.0).toFixed(1)})`,
    color: 0x8b0000,
    apply: (player) => { player.critMult += 1.0; },
  },
  blood_feast: {
    name:  '피의 향연',
    desc:  '치명타 명중 시 HP +2',
    color: 0xaa0033,
    apply: (player) => { player.critHealAmount += 2; },
  },
  map_sense: {
    name:  '던전의 감각',
    desc:  '이 층의 모든 방이 지도에 표시됨',
    color: 0x33bbdd,
    apply: (player) => { player.hasMapReveal = true; },
  },
  secret_sense: {
    name:  '예리한 후각',
    desc:  '비밀 방 입구 벽이 뚜렷하게 드러남',
    color: 0xbb88ee,
    apply: (player) => { player.hasSecretSense = true; },
  },
  core_affinity: {
    name:  '코어 체질',
    desc:  '방 클리어 시 남은 코어 전량 자동 수집',
    color: 0x00d4aa,
    apply: (player) => { player.autoCollectCores = true; },
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

    this._scaleTween = scene.tweens.add({
      targets:  this.gameObject,
      scaleX:   1.35, scaleY: 1.35,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // 발광 링 — 트윈 타겟이 plain object 이므로 dispose 시 명시적으로 제거 필요
    const gfx   = scene.add.graphics().setDepth(6);
    const state = { a: 0.45 };
    this._glowTween = scene.tweens.add({
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
  get id()    { return this._id; }
  get alive() { return this._alive; }

  collect(player) {
    if (!this._alive) return;
    this._def.apply(player);
    player.inventory.push({ id: this._id, name: this._def.name, color: this._def.color, desc: this._def.desc });
    // 영속 해금 목록 갱신 (다음 런 시작 방 풀에 포함됨)
    const unlocked = PassiveItem.getUnlocked();
    if (!unlocked.includes(this._id)) {
      unlocked.push(this._id);
      try { localStorage.setItem('lagomorph_unlocked', JSON.stringify(unlocked)); } catch {}
    }
    this._showFloatText();
    this.dispose();
  }

  /** localStorage에서 한 번이라도 획득한 아이템 ID 배열 반환 (현재 ITEM_DEFS 에 존재하는 항목만) */
  static getUnlocked() {
    try {
      const arr = JSON.parse(localStorage.getItem('lagomorph_unlocked') || '[]');
      return arr.filter(id => ITEM_DEFS[id]);
    } catch { return []; }
  }

  dispose() {
    if (!this._alive) return;
    this._alive = false;
    if (this._glowTween)  { this._glowTween.remove();  this._glowTween  = null; }
    if (this._scaleTween) { this._scaleTween.remove(); this._scaleTween = null; }
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
