package com.lagomorph.game;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // 알림창 확인·앱 복귀 등으로 바가 다시 나타나면 포커스 회복 시 재숨김 (sticky immersive)
        if (hasFocus) enableImmersiveMode();
    }

    /** 상태바 + 내비게이션 바(홈/뒤로가기) 전체 숨김 — 가장자리 스와이프 시에만 일시 노출. */
    private void enableImmersiveMode() {
        // 콘텐츠를 시스템 바 영역까지 확장 (캔버스가 화면 전체를 채우도록)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }
}
