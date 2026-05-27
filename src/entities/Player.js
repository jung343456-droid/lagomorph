/**
 * 플레이어 (VOSS-7 / soma) — 조작 캐릭터
 * 기본 HP 200 / 기본 속도 200
 *
 * 이동: 가상 조이스틱 또는 WASD, 8방향 스프라이트 자동 전환
 * 피격: 무적 시간 동안 깜빡임(alpha 0.35), 이후 재피격 가능
 *       넉백 지속 중에는 플레이어 입력 무시
 * 사망: takeDamage() 반환값 true → 호출부에서 player-dead 이벤트 발행
 *
 * 패시브 아이템 스탯 (기본값):
 *   meleeRadiusMult  1.0   근거리 반경 배율
 *   meleeDamageMult  1.0   근거리 데미지 배율
 *   critRate         0.15  치명타율 (rollAttackDamage 에서 사용)
 *   critMult         1.5   치명타 피해 배율
 *   hasHuntersEye    false 적 처치 후 다음 1발 확정 치명 (사냥꾼의 눈)
 *   critHealAmount   0     치명타 명중 시 회복량 (피의 향연)
 *   chargeSpeedMult  1.0   근거리 충전 속도 배율
 *   hasPoison        false  근거리 명중 시 30% 확률 독 부여
 *   hasFire          false  근거리 명중 시 30% 확률 화상 부여
 *   hasIce           false  근거리 명중 시 30% 확률 빙결
 *   hasThunder       false  근거리 명중 시 70px 연쇄 8피해
 *   healOnKill       0      적 처치 시 HP 회복량
 *   hasFireDisguise   false  불꽃 위장 — 트랩 스플래시 + 30% 화상
 *   hasIceDisguise    false  냉동 위장 — 트랩 스플래시 + 30% 빙결
 *   hasPoisonDisguise false  독성 위장 — 트랩 스플래시 + 30% 중독
 *   trapCostBonus    0      트랩 코어 소모 감소
 *   trapSizeMult     1      트랩 크기 배율
 *   coreDropMult     1      드롭 코어량 배율 (영구 해금 '코어 수집기')
 *   hpPerRoomClear   0      방 클리어 시 회복량 (영구 해금 '전투 적응')
 */
import { showDamageNumber } from '../utils/DamageNumbers';
import { applyUnlocksToPlayer } from '../data/MetaProgress';

const DISPLAY_W = 55; // 스프라이트 표시 너비 (px) — 히트박스와 동일
const DISPLAY_H = 62; // 스프라이트 표시 높이 (px) — 원본 8:9 비율 유지
const BODY_W    = 55; // 물리 히트박스 너비 (px)
const BODY_H    = 53; // 물리 히트박스 높이 (px)

export default class Player {
  constructor(scene, x, y) {
    this.scene  = scene;
    this.baseSpeed = 200;
    this.speed     = 200;
    this.hp        = 200;
    this.maxHp  = 200;

    this._invincible     = false;
    this._knockbackTimer = 0;
    this.facingDir       = { x: 0, y: 1 };
    this.lastDamageSource = null; // 마지막으로 피해 입힌 적 식별자 (사망 결과창 표시용)

    this.meleeRadiusMult  = 1.0;
    this.meleeDamageMult  = 1.0;
    this.critRate         = 0.15;  // 기본 치명타율 15%
    this.critMult         = 1.5;   // 치명타 피해 ×1.5
    this.hasHuntersEye    = false; // 사냥꾼의 눈 — 적 처치 후 다음 한 발 확정 치명
    this.critHealAmount   = 0;     // 피의 향연 — 치명타 명중 시 회복량
    this._pendingCrit     = false; // 다음 rollAttackDamage 1 회를 강제 치명타로
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
    this.coreDropMult     = 1;   // 코어 수집기 해금 시 적용 (EnemyManager.dropCores 참조)
    this.hpPerRoomClear   = 0;   // 전투 적응 해금 시 적용 (RoomManager._onRoomCleared 참조)
    this.inventory        = [];
    this._dir            = 'bottom';

    // 영구 해금 효과 — 기본 스탯 셋업 직후, 게임오브젝트 생성 전에 적용
    applyUnlocksToPlayer(this);

    this.gameObject = scene.add.image(x, y, 'soma-bottom');
    this.gameObject.setDisplaySize(DISPLAY_W, DISPLAY_H);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.body.setMaxVelocity(350, 350);
    this.gameObject.setDepth(10);
  }

  // body.setSize 는 source(scale 전) 픽셀이라 setDisplaySize 로 축소된
  // 큰 원본 텍스처(soma ~380~460px) 위에서는 그대로 넣으면 body 가 ~8px 로 줄어든다.
  // 표시 픽셀 기준 BODY_W × BODY_H 가 되도록 scale 을 역산한다.
  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(BODY_W / sx, BODY_H / sy, true);
  }

  update({ x, y }, delta) {
    const dt = delta / 1000;
    if (this._knockbackTimer > 0) {
      this._knockbackTimer = Math.max(0, this._knockbackTimer - dt);
      return;
    }
    this.gameObject.body.setVelocity(x * this.speed, y * this.speed);
    if (x !== 0 || y !== 0) {
      this.facingDir.x = x;
      this.facingDir.y = y;
      this._setDir(this._vecToDir(x, y));
    }
  }

  /** @returns {boolean} true = 사망 */
  takeDamage(amount, knockback = null) {
    if (this._invincible) return false;

    this.hp = Math.max(0, this.hp - amount);
    this._invincible = true;
    if (amount > 0) showDamageNumber(this.scene, this.x, this.y - DISPLAY_H / 2, amount, '#ff5555');

    if (knockback) {
      const { dx, dy, force, duration } = knockback;
      this._knockbackTimer = duration;
      this.gameObject.body.setVelocity(dx * force, dy * force);
    }

    this.scene.tweens.killTweensOf(this.gameObject);
    this.scene.tweens.add({
      targets:  this.gameObject,
      alpha:    0.35,
      duration: 80,
      yoyo:     true,
      repeat:   2,
      onComplete: () => {
        this.gameObject.setAlpha(1);
        this._invincible = false;
      },
    });

    return this.hp <= 0;
  }

  /** 보스 포효 등 무피해 기절 (무적 중엔 무시) */
  stun(duration) {
    if (this._invincible) return;
    this._knockbackTimer = duration;
    this.gameObject.body.setVelocity(0, 0);
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /**
   * 치명타 굴림 — base 데미지에 critRate 확률로 critMult 배율 적용.
   * `_pendingCrit` 이 true 면 확률 무시하고 확정 치명 (사냥꾼의 눈 보유 + 직전 처치 시 set).
   * @returns {{ damage:number, isCrit:boolean }} 적용할 정수 데미지와 치명타 여부
   */
  rollAttackDamage(base) {
    let isCrit;
    if (this._pendingCrit) {
      isCrit = true;
      this._pendingCrit = false;
    } else {
      isCrit = Math.random() < this.critRate;
    }
    const damage = isCrit ? Math.round(base * this.critMult) : base;
    return { damage, isCrit };
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _setDir(dir) {
    if (dir === this._dir) return;
    this._dir = dir;
    this.gameObject.setTexture(`soma-${dir}`);
    // 텍스처 교체 시 스케일이 초기화되므로 재적용
    this.gameObject.setDisplaySize(DISPLAY_W, DISPLAY_H);
    // 방향마다 원본 텍스처 크기가 달라 scale 이 바뀌므로 body 도 재계산
    this._applyBodySize();
  }

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
