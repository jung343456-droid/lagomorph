/**
 * 피격 시 데미지 숫자 팝업
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y      - 숫자가 나타날 y (보통 스프라이트 상단)
 * @param {number} amount - 표시할 수치 (0이면 무시)
 * @param {string} color  - CSS 색상 문자열 (기본 흰색)
 */
export function showDamageNumber(scene, x, y, amount, color = '#ffffff') {
  if (!amount) return;
  const ox  = (Math.random() - 0.5) * 18;
  const txt = scene.add.text(x + ox, y, String(Math.ceil(amount)), {
    fontSize:         '15px',
    color,
    fontFamily:       'monospace',
    stroke:           '#000000',
    strokeThickness:  3,
  }).setOrigin(0.5, 1).setDepth(70);

  scene.tweens.add({
    targets:  txt,
    y:        y - 40,
    alpha:    0,
    duration: 850,
    ease:     'Quad.Out',
    onComplete: () => txt.destroy(),
  });
}
