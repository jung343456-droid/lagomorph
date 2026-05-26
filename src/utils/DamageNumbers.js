/**
 * 피격 시 데미지 숫자 팝업
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y      - 숫자가 나타날 y (보통 스프라이트 상단)
 * @param {number} amount - 표시할 수치 (0이면 무시)
 * @param {string} color  - CSS 색상 문자열 (기본 흰색)
 * @param {boolean} isCrit - true 시 노란색 + 큰 폰트로 강조
 */
export function showDamageNumber(scene, x, y, amount, color = '#ffffff', isCrit = false) {
  if (!amount) return;
  const ox  = (Math.random() - 0.5) * 18;
  const txt = scene.add.text(x + ox, y, String(Math.ceil(amount)) + (isCrit ? '!' : ''), {
    fontSize:         isCrit ? '20px' : '15px',
    color:            isCrit ? '#ffdd33' : color,
    fontFamily:       'monospace',
    fontStyle:        isCrit ? 'bold' : 'normal',
    stroke:           '#000000',
    strokeThickness:  isCrit ? 4 : 3,
  }).setOrigin(0.5, 1).setDepth(70);

  scene.tweens.add({
    targets:  txt,
    y:        y - (isCrit ? 50 : 40),
    alpha:    0,
    duration: isCrit ? 1000 : 850,
    ease:     'Quad.Out',
    onComplete: () => txt.destroy(),
  });
}
