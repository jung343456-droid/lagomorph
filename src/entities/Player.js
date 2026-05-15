/**
 * 플레이어 (VOSS-7 / soma) — 조작 캐릭터
 * HP 100 / 속도 200
 *
 * 이동: 가상 조이스틱 또는 WASD, 8방향 스프라이트 자동 전환
 * 피격: 무적 시간 동안 깜빡임(alpha 0.35), 이후 재피격 가능
 *       넉백 지속 중에는 플레이어 입력 무시
 * 사망: takeDamage() 반환값 true → 호출부에서 player-dead 이벤트 발행
 */
const DISPLAY_W = 64; // 스프라이트 표시 너비 (px)
const DISPLAY_H = 72; // 스프라이트 표시 높이 (px)
const BODY_W    = 48; // 물리 히트박스 너비 (px)
const BODY_H    = 46; // 물리 히트박스 높이 (px)

export default class Player {
  constructor(scene, x, y) {
    this.scene  = scene;
    this.baseSpeed = 200;
    this.speed     = 200;
    this.hp        = 100;
    this.maxHp  = 100;

    this._invincible     = false;
    this._knockbackTimer = 0;
    this.facingDir       = { x: 0, y: 1 };
    this._dir            = 'bottom';

    this.gameObject = scene.add.image(x, y, 'soma-bottom');
    this.gameObject.setDisplaySize(DISPLAY_W, DISPLAY_H);
    scene.physics.add.existing(this.gameObject);
    this.gameObject.body.setSize(BODY_W, BODY_H, true);
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.body.setMaxVelocity(350, 350);
    this.gameObject.setDepth(10);
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

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _setDir(dir) {
    if (dir === this._dir) return;
    this._dir = dir;
    this.gameObject.setTexture(`soma-${dir}`);
    // 텍스처 교체 시 스케일이 초기화되므로 재적용
    this.gameObject.setDisplaySize(DISPLAY_W, DISPLAY_H);
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
