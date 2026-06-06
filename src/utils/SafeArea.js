/**
 * SafeArea — 모바일 안전영역(노치·홈 인디케이터) 측정 유틸
 *
 * Scale.FIT 캔버스는 게임 좌표(390×844)와 실제 화면 CSS 픽셀의 배율이 기종마다 다르다.
 * `env(safe-area-inset-*)` 는 CSS 픽셀 단위이므로, 게임 좌표로 환산해야 UI 패널 마진에 쓸 수 있다.
 *
 * 동작:
 *   1. 숨김 probe 엘리먼트로 `env(safe-area-inset-bottom)` 의 실제 CSS px 값을 읽는다.
 *   2. 캔버스의 화면상 실제 위치(getBoundingClientRect)로 캔버스 하단~화면 하단 여백을 구한다.
 *      → letterbox(상하 검은 띠)로 이미 띄워진 만큼은 안전영역과 겹치지 않으므로 차감.
 *   3. 남은 겹침(px)을 displayScale.y(게임좌표/CSS px)로 곱해 게임 좌표 단위로 환산.
 *
 * 전제: index.html 의 viewport 메타에 `viewport-fit=cover` 가 있어야 env() 가 0이 아닌 값을 준다.
 */

let _probe = null;

function readInsetCss(side) {
  if (!_probe) {
    _probe = document.createElement('div');
    _probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;';
    document.body.appendChild(_probe);
  }
  _probe.style.height = `env(safe-area-inset-${side}, 0px)`;
  return _probe.getBoundingClientRect().height;
}

/**
 * 화면 하단 안전영역을 게임 좌표 단위로 환산해 반환.
 * 안전영역이 없거나 letterbox 로 이미 가려지지 않는 기종에서는 0.
 * @param {Phaser.Scene} scene
 * @returns {number} 게임 좌표 단위 하단 마진
 */
export function safeInsetBottom(scene) {
  const insetCss = readInsetCss('bottom');
  if (insetCss <= 0) return 0;

  const canvas = scene.game.canvas;
  const rect   = canvas.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  // 캔버스 하단과 화면(visual viewport) 하단 사이 여백 — letterbox 띠
  const gapBelowCss = Math.max(0, window.innerHeight - rect.bottom);
  // letterbox 로 이미 띄워진 만큼 빼고 남은 실제 겹침
  const overlapCss  = Math.max(0, insetCss - gapBelowCss);
  if (overlapCss <= 0) return 0;

  // 게임좌표/CSS px 배율 = 게임 높이 / 캔버스 실제 CSS 높이 (displayScale.y 와 동일하나 초기화 타이밍 무관)
  const scaleY = scene.scale.gameSize.height / rect.height;
  return overlapCss * scaleY;
}
