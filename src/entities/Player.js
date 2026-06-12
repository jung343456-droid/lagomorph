/**
 * 플레이어 (VOSS-7 / soma) — 조작 캐릭터
 * 기본 HP 100 / 기본 속도 210
 *
 * 이동: 가상 조이스틱 또는 WASD, 8방향 걷기 애니메이션 (soma-walk 시트, 방향별 4프레임)
 *       이동 중에만 프레임 순환, 정지 시 해당 방향 0번 프레임 고정
 * 피격: 무적 시간 동안 깜빡임(alpha 0.35), 이후 재피격 가능
 *       넉백 지속 중에는 플레이어 입력 무시
 * 사망: takeDamage() 반환값 true → 호출부에서 player-dead 이벤트 발행
 *
 * 패시브 아이템 스탯 (기본값):
 *   meleeRadiusMult  1.0   근거리 반경 배율
 *   meleeDamageMult  1.0   근거리 데미지 배율
 *   critRate         0.15  치명타율 (rollAttackDamage 에서 사용)
 *   critMult         1.5   치명타 피해 배율
 *   critHealAmount   0     치명타 명중 시 회복량 (피의 향연)
 *   chargeSpeedMult  1.0   근거리 충전 속도 배율
 *   hasPoison        false  근거리 명중 시 25% 확률 독 부여
 *   hasFire          false  근거리 명중 시 25% 확률 화상 부여
 *   hasIce           false  근거리 명중 시 25% 확률 빙결
 *   hasThunder       false  근거리 명중 시 25% 확률로 150px 반경 연쇄, hop마다 직전 데미지의 50% (≥2 유지, 최대 10hop)
 *   healOnKill       0      적 처치 시 HP 회복량
 *   hasFireDisguise   false  불꽃 위장 — 트랩 스플래시 + 20% 화상
 *   hasIceDisguise    false  냉동 위장 — 트랩 스플래시 + 20% 빙결
 *   hasPoisonDisguise false  독성 위장 — 트랩 스플래시 + 20% 중독
 *   trapCostBonus    0      트랩 코어 소모 감소
 *   trapSizeMult     1      트랩 크기 배율
 *   healItemMult     1.0    회복 아이템(상점 heal/heal_pct + 보스 RareItem) 효과 배율 — 대식가 +0.1
 *   coreDropMult     1      드롭 코어량 배율 (영구 해금 '코어 수집기' ×1.15, '황금손' ×1.10)
 *   hpPerRoomClear   0      방 클리어 시 회복량 (영구 해금 '전투 적응' +2, '거듭난 숨결' +2)
 *   shopSlotBonus    0      상점 슬롯 추가 수 (영구 해금 '상인의 호의' / '상인의 계약' — 기본 3 + 보너스)
 *   armor            0      받는 피해 평탄 감산 (방탄조끼 +2, 영구 해금 '강화 외피' +1) — amount = max(0, amount - armor), 0 이면 피격 자체 무효. 독·화상 피해(bypassArmor) 는 관통.
 *   damageReduction  0      받는 피해 감산 비율 (영구 해금 '두꺼운 가죽 I' — amount × (1-reduction), 최소 1). 독·화상 피해(bypassArmor) 는 관통.
 *   extraLives       0      런당 사망 무효 횟수 (영구 해금 '최후의 발버둥' — 치명타 흡수 후 maxHp×30% 복원)
 *   extraStartItems  0      시작 방 추가 아이템 수 (영구 해금 '기억 단편화' — 기본 1 + 보너스)
 *   shopPriceMult    1      상점 가격 배율 (영구 해금 '상인의 신용' ×0.9, '흥정 II' ×0.95, DungeonGenerator._generateShopSlots 참조)
 *   trapMaxBonus     0      트랩 최대 동시 설치 추가 수 (영구 해금 '덫꾼의 손' +1) — AttackManager MAX_POOPS + bonus
 *   startingCores    0      런 시작 코어 추가 (영구 해금 '점화의 잔해' +10) — GameScene.create 에서 enemyManager.coreCount 에 합산
 *   invulnDurationMult 1    피격 후 무적 깜빡임 지속 배율 (영구 해금 '잔영의 가호' ×1.25) — takeDamage 일반 분기 tween duration 에 적용
 *   hasMapReveal     false 현재 층 전체 방을 지도에 표시 (던전의 감각)
 *   metaRetainRate   0.25   사망 시 메타 픽업분 보존율 (영구 해금 '잔해 회수 I~IV' +0.05 씩 → 최대 0.45) — MetaProgress.commitMetaRun 참조
 *   autoCollectCores false  방 클리어 시 남은 코어 전량 자석 흡수 — 기본 해제, 패시브 아이템으로 활성화 (EnemyManager._collectAllCores 게이팅)
 *   corePickupRange  55     코어 자동 흡수 시작 반경(px) — 해금 '코어 흡수 I~III' +15 씩 (→ 70/85/100)
 *
 * 임시 저장: serialize() 로 좌표·스탯·플래그·인벤토리를 평문 객체로 추출, applySave(data) 로 복원한다.
 *   복원 시 저장된 스탯으로 전부 덮어쓴다 — 런 중 패시브 아이템이 변경한 값까지 반영하기 위함
 *   (생성자 applyUnlocksToPlayer 효과는 이미 저장값에 녹아 있으므로 이중 적용 없음).
 */
import { showDamageNumber, showHealNumber } from '../utils/DamageNumbers';
import { applyUnlocksToPlayer } from '../data/MetaProgress';

const PLAYER_SCALE = 0.45; // soma-walk 셀(128×128, 내용물 높이 ~100px) 공통 스케일 → 표시 높이 ~45px
const DISPLAY_H    = 56;    // 표시 높이 근사치 (px) — 데미지/회복 숫자·텍스트 위치 기준
const BODY_W       = 40;    // 물리 히트박스 너비 (px)
const BODY_H       = 38;    // 물리 히트박스 높이 (px)
const WALK_FPS_MS  = 125;   // 걷기 프레임 전환 간격 (ms) ≈ 8fps

// soma-walk 시트: 8행(방향) × 4열(걷기 프레임). 행 = 반시계 방향 순서.
// 프레임 인덱스 = row*4 + frame (Phaser 스프라이트시트 행우선 인덱싱)
const DIR_ROW = {
  bottom: 0, 'bottom-left': 1, left: 2, 'top-left': 3,
  top: 4, 'top-right': 5, right: 6, 'bottom-right': 7,
};

// 임시 저장 대상 스탯 키 — 런 중 패시브 아이템/해금으로 변동되는 값 일체.
// (위치·HP·방향·인벤토리는 별도 처리, 타이머/무적 등 전이성 상태는 복원 시 리셋)
const SAVE_STAT_KEYS = [
  'meleeRadiusMult', 'meleeDamageMult', 'critRate', 'critMult', 'critHealAmount',
  'hasPoison', 'hasFire', 'hasIce', 'hasThunder', 'healOnKill', 'chargeSpeedMult',
  'hasFireDisguise', 'hasIceDisguise', 'hasPoisonDisguise', 'trapCostBonus', 'trapSizeMult',
  'healItemMult', 'coreDropMult', 'hpPerRoomClear', 'shopSlotBonus', 'armor', 'damageReduction',
  'trapMaxBonus', 'startingCores', 'invulnDurationMult', 'hasMapReveal', 'extraLives',
  'extraStartItems', 'shopPriceMult', 'metaRetainRate', 'autoCollectCores', 'corePickupRange',
];

export default class Player {
  constructor(scene, x, y) {
    this.scene  = scene;
    this.baseSpeed = 210;
    this.speed     = 210;
    this.hp        = 100;
    this.maxHp  = 100;

    this._invincible     = false;
    this._knockbackTimer = 0;
    this._slowTimer      = 0;     // 구역 2 거미줄 — applySlow(dur) 로 갱신, > 0 동안 이동속도 ×0.4
    this.facingDir       = { x: 0, y: 1 };
    this.lastDamageSource = null; // 마지막으로 피해 입힌 적 식별자 (사망 결과창 표시용)

    this.meleeRadiusMult  = 1.0;
    this.meleeDamageMult  = 1.0;
    this.critRate         = 0.15;  // 기본 치명타율 15%
    this.critMult         = 1.5;   // 치명타 피해 ×1.5
    this.critHealAmount   = 0;     // 피의 향연 — 치명타 명중 시 회복량
    this.hasPoison        = false;
    this.hasFire          = false;
    this.hasIce           = false;
    this.hasThunder       = false;
    this.healOnKill       = 0;
    this.chargeSpeedMult  = 1.0;
    this.hasFireDisguise   = false;
    this.hasIceDisguise    = false;
    this.hasPoisonDisguise = false;
    this.trapCostBonus    = 0;
    this.trapSizeMult     = 1;
    this.healItemMult     = 1.0; // 회복 아이템(상점 heal/heal_pct + 보스 RareItem) 효과 배율 — 대식가 +0.1
    this.coreDropMult     = 1;   // 코어 수집기 해금 시 적용 (EnemyManager.dropCores 참조)
    this.hpPerRoomClear   = 0;   // 전투 적응 해금 시 적용 (RoomManager._onRoomCleared 참조)
    this.shopSlotBonus    = 0;   // 상인의 호의 해금 시 +1 (DungeonGenerator._generateShopSlots 참조)
    this.armor            = 0;   // 방탄조끼 +2 / 강화 외피 +1 (takeDamage 에서 amount - armor, 0 이면 피격 무효)
    this.damageReduction  = 0;   // 두꺼운 가죽 I 해금 시 +0.05 (takeDamage 에서 amount × (1-reduction))
    this.trapMaxBonus     = 0;   // 덫꾼의 손 +1 (AttackManager MAX_POOPS + bonus)
    this.startingCores    = 0;   // 점화의 잔해 +10 (GameScene.create 에서 enemyManager.coreCount 에 합산)
    this.invulnDurationMult = 1; // 잔영의 가호 ×1.25 (takeDamage 일반 분기 tween duration 에 적용)
    this.hasMapReveal     = false; // 던전의 감각 — 현재 층 전체 방을 지도에 표시
    this.extraLives       = 0;   // 최후의 발버둥 해금 시 +1 (takeDamage 치명 흡수)
    this.extraStartItems  = 0;   // 기억 단편화 해금 시 +1 (GameScene._spawnStartRoomItem 참조)
    this.shopPriceMult    = 1;   // 상인의 신용 해금 시 ×0.9 (DungeonGenerator._generateShopSlots 참조)
    this.metaRetainRate   = 0.25; // 사망 시 메타 픽업분 보존율 — 잔해 회수 해금으로 +0.05 씩 (MetaProgress.commitMetaRun 참조)
    this.autoCollectCores = false; // 방 클리어 시 남은 코어 전량 자석 흡수 — 기본 해제, 패시브 아이템으로 활성화 (EnemyManager._collectAllCores 참조)
    this.corePickupRange  = 55;  // 코어 자동 흡수 시작 반경(px) — 해금 '코어 흡수 I~III' +15 씩 (EnemyManager update 자석 분기 참조)
    this.inventory        = [];
    this._dir            = 'bottom';
    this._row            = DIR_ROW.bottom; // 현재 방향 행
    this._animFrame      = 0;              // 걷기 프레임 0~3
    this._animTimer      = 0;              // 프레임 누적 시간 (ms)

    // 영구 해금 효과 — 기본 스탯 셋업 직후, 게임오브젝트 생성 전에 적용
    applyUnlocksToPlayer(this);

    this.gameObject = scene.add.image(x, y, 'soma-walk', 0);
    this.gameObject.setScale(PLAYER_SCALE);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.body.setMaxVelocity(350, 350);
    this.gameObject.setDepth(10);
  }

  // body.setSize 는 source(scale 전) 픽셀이라 PLAYER_SCALE 로 축소된 프레임에서
  // 그대로 넣으면 body 가 작아진다. 표시 픽셀 기준 BODY_W × BODY_H 가 되도록 scale 을 역산한다.
  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(BODY_W / sx, BODY_H / sy, true);
  }

  update({ x, y }, delta) {
    const dt = delta / 1000;
    if (this._slowTimer > 0) this._slowTimer = Math.max(0, this._slowTimer - dt);

    if (this._knockbackTimer > 0) {
      this._knockbackTimer = Math.max(0, this._knockbackTimer - dt);
      return;
    }
    const slowMult = this._slowTimer > 0 ? 0.3 : 1;
    this.gameObject.body.setVelocity(x * this.speed * slowMult, y * this.speed * slowMult);

    if (x !== 0 || y !== 0) {
      this.facingDir.x = x;
      this.facingDir.y = y;
      const dir = this._vecToDir(x, y);
      if (dir !== this._dir) {
        this._dir = dir;
        this._row = DIR_ROW[dir];
        this._animFrame = 0;
        this._animTimer = 0;
      }
      // 이동 중에만 걷기 프레임 순환 (setFrame 3번째 인자 false 로 스케일 유지)
      this._animTimer += delta;
      if (this._animTimer >= WALK_FPS_MS) {
        this._animTimer -= WALK_FPS_MS;
        this._animFrame = (this._animFrame + 1) % 4;
      }
      this.gameObject.setFrame(this._row * 4 + this._animFrame, false, false);
    } else {
      // 정지: 해당 방향 0번 프레임 고정
      this._animFrame = 0;
      this._animTimer = 0;
      this.gameObject.setFrame(this._row * 4, false, false);
    }
  }

  /** 거미줄 등 슬로우 효과 — 매 프레임 갱신되며 만료되면 자동 해제 */
  applySlow(duration) {
    if (duration > this._slowTimer) this._slowTimer = duration;
  }

  /**
   * @param {number} amount
   * @param {object|null} knockback
   * @param {object} [options]
   * @param {boolean} [options.bypassArmor] true 면 armor·damageReduction 무시 (독·화상 등 상태이상 DoT — 방어력 관통)
   * @returns {boolean} true = 사망
   */
  takeDamage(amount, knockback = null, options = {}) {
    if (this._invincible) return false;

    const bypassArmor = options.bypassArmor === true;

    // 방탄조끼 — 평탄 감산. armor 이하 공격은 통째로 무시 (무적/넉백/숫자 모두 스킵).
    // 독·화상 등 상태이상 DoT (bypassArmor=true) 는 방어력 관통.
    if (!bypassArmor && amount > 0 && this.armor > 0) {
      amount -= this.armor;
      if (amount <= 0) return false;
    }

    if (!bypassArmor && amount > 0 && this.damageReduction > 0) {
      amount = Math.max(1, Math.round(amount * (1 - this.damageReduction)));
    }

    // 최후의 발버둥 — 치명타 흡수 (런당 extraLives 회 한정)
    //   amount >= hp 일 때만 발동: 일반 피격은 평소대로 처리, 정말 죽을 한 방만 무효화
    //   복원량은 maxHp×30%, 1초 무적 + 노란 깜빡임으로 즉시 재피격 방지
    if (amount > 0 && amount >= this.hp && this.extraLives > 0) {
      this.extraLives--;
      this.hp = Math.max(1, Math.round(this.maxHp * 0.3));
      this._invincible = true;
      this._showLastStruggleFX();
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer = duration;
        this.gameObject.body.setVelocity(dx * force, dy * force);
      }
      this.scene.tweens.killTweensOf(this.gameObject);
      this.scene.tweens.add({
        targets:  this.gameObject,
        alpha:    0.3,
        duration: 120,
        yoyo:     true,
        repeat:   6,
        onComplete: () => {
          this.gameObject.setAlpha(1);
          this._invincible = false;
        },
      });
      return false;
    }

    // 피해 0: 넉백만 적용, 무적·깜빡임 없음 (고슴도치 가시 반격 등)
    if (amount <= 0) {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer = duration;
        this.gameObject.body.setVelocity(dx * force, dy * force);
      }
      return false;
    }

    this.hp = Math.max(0, this.hp - amount);
    this._invincible = true;
    showDamageNumber(this.scene, this.x, this.y - DISPLAY_H / 2, amount, '#ff5555');

    if (knockback) {
      const { dx, dy, force, duration } = knockback;
      this._knockbackTimer = duration;
      this.gameObject.body.setVelocity(dx * force, dy * force);
    }

    this.scene.tweens.killTweensOf(this.gameObject);
    this.scene.tweens.add({
      targets:  this.gameObject,
      alpha:    0.35,
      duration: Math.round(80 * (this.invulnDurationMult ?? 1)),
      yoyo:     true,
      repeat:   2,
      onComplete: () => {
        this.gameObject.setAlpha(1);
        this._invincible = false;
      },
    });

    return this.hp <= 0;
  }

  _showLastStruggleFX() {
    const txt = this.scene.add.text(this.x, this.y - DISPLAY_H, '최후의 발버둥!', {
      fontSize: '14px', color: '#ffee44', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(60);
    this.scene.tweens.add({
      targets:  txt,
      y:        txt.y - 36,
      alpha:    0,
      duration: 1200,
      ease:     'Quad.Out',
      onComplete: () => { if (txt.active) txt.destroy(); },
    });
  }

  /** 즉시 정지 — 대화/메뉴 진입 시 잔여 속도로 미끄러지는 것 방지 (정지 프레임 고정) */
  halt() {
    this.gameObject.body.setVelocity(0, 0);
    this._animFrame = 0;
    this._animTimer = 0;
    this.gameObject.setFrame(this._row * 4, false, false);
  }

  /** 보스 포효 등 무피해 기절 (무적 중엔 무시) */
  stun(duration) {
    if (this._invincible) return;
    this._knockbackTimer = duration;
    this.gameObject.body.setVelocity(0, 0);
  }

  heal(amount) {
    if (!amount || amount <= 0) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const actual = this.hp - before;
    if (actual > 0) showHealNumber(this.scene, this.x, this.y - DISPLAY_H / 2, actual);
  }

  /**
   * 치명타 굴림 — base 데미지에 critRate 확률로 critMult 배율 적용.
   * @returns {{ damage:number, isCrit:boolean }} 적용할 정수 데미지와 치명타 여부
   */
  rollAttackDamage(base) {
    const isCrit = Math.random() < this.critRate;
    const damage = isCrit ? Math.round(base * this.critMult) : base;
    return { damage, isCrit };
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── 임시 저장 ─────────────────────────────────────────

  /** 복원에 필요한 전체 상태를 평문 객체로 추출. */
  serialize() {
    const stats = {};
    for (const k of SAVE_STAT_KEYS) stats[k] = this[k];
    return {
      x: this.gameObject.x,
      y: this.gameObject.y,
      hp: this.hp,
      maxHp: this.maxHp,
      baseSpeed: this.baseSpeed,
      dir: this._dir,
      facingDir: { ...this.facingDir },
      lastDamageSource: this.lastDamageSource,
      inventory: (this.inventory ?? []).map(it => ({ ...it })),
      stats,
    };
  }

  /** serialize() 결과를 현재 인스턴스에 적용. 전이성 상태(무적·넉백·슬로우)는 리셋한다. */
  applySave(data) {
    if (!data) return;
    this.hp        = data.hp;
    this.maxHp     = data.maxHp;
    this.baseSpeed = data.baseSpeed ?? this.baseSpeed;
    this.speed     = this.baseSpeed; // 전이성 슬로우는 복원하지 않음
    this._dir      = data.dir ?? 'bottom';
    this._row      = DIR_ROW[this._dir] ?? DIR_ROW.bottom;
    this.facingDir = { ...(data.facingDir ?? { x: 0, y: 1 }) };
    this.lastDamageSource = data.lastDamageSource ?? null;
    this.inventory = (data.inventory ?? []).map(it => ({ ...it }));
    if (data.stats) for (const k of SAVE_STAT_KEYS) {
      if (data.stats[k] !== undefined) this[k] = data.stats[k];
    }

    this._invincible     = false;
    this._knockbackTimer = 0;
    this._slowTimer      = 0;
    this._animFrame      = 0;
    this._animTimer      = 0;

    this.gameObject.setPosition(data.x, data.y);
    this.gameObject.body.reset(data.x, data.y);
    this.gameObject.setAlpha(1);
    this.gameObject.setFrame(this._row * 4, false, false);
  }

  // ── private ─────────────────────────────────────────

  _vecToDir(x, y) {
    const a = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    if (a >= 337.5 || a <  22.5) return 'right';
    if (a <  67.5)               return 'bottom-right';
    if (a < 112.5)               return 'bottom';
    if (a < 157.5)               return 'bottom-left';
    if (a < 202.5)               return 'left';
    if (a < 247.5)               return 'top-left';
    if (a < 292.5)               return 'top';
    return 'top-right';
  }
}
