/**
 * SafeArea — 화면 하단이 가려지는 양을 게임 좌표 단위로 측정
 *
 * 모바일에서 대화 패널 하단이 잘리는 원인은 두 가지가 섞여 있다:
 *   1. 노치 기기의 홈 인디케이터·제스처바 (env(safe-area-inset-bottom))
 *   2. 100vh 로 잡힌 캔버스가 브라우저 툴바/제스처 영역 아래로 뻗어 보이는 영역 밖으로 나감
 * 일반 브라우저에선 (1)이 0으로 보고되므로 env() 만으로는 (2)를 못 잡는다.
 *
 * 그래서 env() 에 의존하지 않고 "캔버스의 실제 하단 위치(getBoundingClientRect.bottom)"를
 * "실제로 보이는 영역의 안전한 하단(visualViewport 높이 − 안전영역 인셋)"과 직접 비교한다.
 * 캔버스 하단이 그 선을 넘은 만큼이 가려진 양이며, Scale.FIT 배율로 게임 좌표로 환산한다.
 *
 * 전제: index.html viewport 메타에 viewport-fit=cover (노치 인셋이 0이 아니게).
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
 * 화면 하단이 가려지는 양을 게임 좌표 단위로 반환. 가려지는 곳이 없으면 0.
 * @param {Phaser.Scene} scene
 * @returns {number} 게임 좌표 단위 하단 마진
 */
export function safeInsetBottom(scene) {
  const canvas = scene.game.canvas;
  const rect   = canvas.getBoundingClientRect();
  if (rect.height <= 0) return 0;

  // 실제로 보이는 영역 높이 (visualViewport 가 키보드·툴바 반영해 더 정확)
  const vpH = window.visualViewport?.height ?? window.innerHeight;
  // 보이는 영역 중 안전한 하단 경계 (홈 인디케이터 인셋 제외)
  const safeBottomCss = vpH - readInsetCss('bottom');
  // 캔버스 하단이 안전 경계를 넘어 가려진 양 (뷰포트 밖 + 인셋 겹침 통합)
  const hiddenCss = Math.max(0, rect.bottom - safeBottomCss);
  if (hiddenCss <= 0) return 0;

  // 게임좌표/CSS px 배율 = 게임 높이 / 캔버스 실제 CSS 높이
  const scaleY = scene.scale.gameSize.height / rect.height;
  return hiddenCss * scaleY;
}
