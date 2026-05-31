# LAGOMORPH — 모바일 패키징 (Capacitor)

웹 빌드 결과물(`dist/`)을 Capacitor가 네이티브 앱의 WebView로 감싼다.
**게임 코드는 그대로 두고 `dist/`를 동기화만** 하므로, 평소 웹 개발 방식은 바뀌지 않는다.

> **현재 상태**: 환경변수·`android/` 프로젝트·전체 빌드 체인까지 검증 완료 (`app-debug.apk` 생성 확인).
> 남은 것은 **기기 연결**(실제 폰 또는 에뮬레이터)뿐이다.

```
평소:  npm run dev          → 브라우저 테스트 (지금과 동일)
가끔:  npm run mobile       → 모바일 빌드 + android 동기화
       npx cap run android  → 폰/에뮬레이터로 실행
```

---

## 설정 구조

### `vite.config.js` — `base` 모드 분기 ⚠️
- **웹/GitHub Pages**: `base: '/lagomorph/'` (절대경로)
- **모바일**: `base: './'` (상대경로) — Capacitor는 `file://` 로 로드하므로 절대경로면 에셋이 전부 깨진다.
- 분기 기준: `vite build --mode mobile` 의 `mode` 값.

### `package.json` 스크립트
| 스크립트 | 동작 |
|---|---|
| `npm run dev` | 웹 개발 서버 (변화 없음) |
| `npm run build` | 웹 배포 빌드 (`base=/lagomorph/`) |
| `npm run build:mobile` | 모바일 빌드 (`base=./`) — `dist/` 생성 |
| `npm run mobile` | `build:mobile` + `cap sync android` |

### `capacitor.config.json`
- `appId: com.lagomorph.game`, `appName: Lagomorph`, `webDir: dist`
- `SplashScreen.launchShowDuration: 0` (스플래시 즉시 해제)

### 설치된 패키지 (Capacitor v8)
- deps: `@capacitor/core`, `@capacitor/android`
- devDeps: `@capacitor/cli`
- ⚠️ Capacitor 8은 **Node 20+ 필요** (`node -v` 확인)

---

## 최초 1회 환경 설정 (PC) — ✅ 완료됨

1. **Android Studio** 설치 (Android SDK 포함). iOS는 macOS 필수 — 안드로이드만 노리면 불필요.
   - 확인된 구성: SDK `platform android-35`, build-tools 35.0.1/37.0.0, 번들 JDK 21(`jbr`).
2. **환경변수** (User 레벨, CLI 빌드에 필요). Android Studio에서 직접 ▶ 실행할 땐 IDE가 잡아줘서 없어도 되지만, `npm run mobile`/`gradlew` CLI에는 필요:
   ```powershell
   [Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Android\Android Studio\jbr', 'User')
   [Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
   ```
   설정 후 **새 터미널**부터 반영된다.
3. 네이티브 프로젝트 생성:
   ```bash
   npx cap add android      # android/ 폴더 생성
   ```
4. 기기 준비 (둘 중 하나): 실제 폰 **USB 디버깅 + PC 인증**, 또는 Android Studio에서 **에뮬레이터(AVD)** 생성.

---

## 모바일 확인 워크플로우 (매번)

*루트 경로에서 npx cap run android 커맨드 치고, 연결한 폰 지정하면 OK

```bash
npm run mobile           # 빌드 + dist/를 android 프로젝트에 복사
npx cap run android      # 연결된 폰/에뮬레이터로 바로 실행
```
또는 Android Studio에서 직접 열어 실행:
```bash
npx cap open android     # Android Studio 열기 → ▶ 실행
```

기기 없이 **APK만** 다시 만들려면 (`android/` 폴더에서):
```powershell
.\gradlew.bat assembleDebug   # → android/app/build/outputs/apk/debug/app-debug.apk
```
최초 빌드는 Gradle 배포판·의존성 다운로드로 ~5분, 이후엔 캐시로 빨라진다.

---

## 모바일에서 중점 확인 사항

- **가상 조이스틱 터치 반응** (`InputManager` 가상 조이스틱)
- **`Scale.FIT` 화면비** — 다양한 기기 해상도에서 390×844 비율 유지 여부
- **멀티터치** (`activePointers: 3`) — 이동 + 공격 동시 입력
- **프레임레이트** — 적 다수 스폰 시 성능 (특히 군집 rat, Wolf 소환 구간)
- **번들 크기** — 현재 JS 번들 ~1.6MB(gzip ~383KB). 로딩 체감 확인.

---

## .gitignore — ✅ 설정 완료

네이티브 프로젝트와 빌드 산출물은 커밋에서 제외한다. `.gitignore`에 이미 반영됨:
```
dist/
android/
ios/
.capacitor/
```
- `android/`는 통째로 무시 → 레포에 없으며 `npx cap add android` 로 언제든 재생성된다.
- ⚠️ 그래서 **`android/` 내부를 직접 수정**(앱 아이콘, 스플래시, `AndroidManifest` 권한 등)하면 재생성 시 사라진다. 그런 네이티브 커스터마이징이 생기면 그때 `android/`를 추적 대상으로 전환할지 재검토할 것.

---

## 향후: 광고 · 인앱결제 (안드로이드)

> 아직 미구현. **게임플레이 안정화 후 출시 직전에** 붙인다. 둘 다 네이티브 플러그인을
> JS(게임 코드)에서 `await` 로 호출하는 방식 — 광고/결제 중 게임을 일시정지했다가 재개한다.
> 자체 결제는 쓰지 않고 **Google Play Billing** 만 사용한다 (디지털 상품은 Play 정책상 필수).

### 광고 — AdMob
- 플러그인: **`@capacitor-community/admob`**
- 게임 활용: **보상형(Rewarded)** = "광고 보고 부활 / 코어 2배 / 아이템 추가", **전면(Interstitial)** = 층 클리어 사이(과용 금지). 배너는 390×844 화면 잠식이라 비추천.
- 준비물: AdMob 계정·광고 단위 ID, 개발 중 **테스트 광고 ID 사용**(실광고 클릭 시 계정 정지 위험), **UMP 동의 SDK**, **개인정보처리방침 URL**.

### 인앱결제 — Google Play Billing
- 권장: **RevenueCat** (`@revenuecat/purchases-capacitor`) — 영수증 검증·상품 관리 대신 처리, 백엔드 없이 안전, 월매출 $2.5k까지 무료. (대안: `cordova-plugin-purchase` + 자체 검증)
- 상품 유형: **소모성**(코인·부활권, 재구매 가능) / **비소모성**("광고 제거"·영구 해금). 구독은 보통 불필요.
- 주의: 결제 성공 후 **`acknowledge`/consume 호출 필수** — 누락 시 구글이 자동 환불.

### 공통 사전 준비 (계정·콘솔)
- **Google Play 개발자 계정** ($25 1회)
- 앱을 **최소 내부 테스트 트랙에 업로드**해야 결제·실광고 작동 (테스트 광고는 업로드 없이 OK)
- **릴리즈 키 서명** + 패키지명 `com.lagomorph.game` 일치
- Play Console에 **상품 ID 등록**(예: `revive_1`, `remove_ads`), **라이선스 테스터** 등록 시 실제 청구 없이 결제 테스트

### Phaser 통합 시 주의
- 광고/결제는 **비동기** → `await` 동안 `scene.scene.pause()` / `physics.pause()`, 닫히면 재개
- 광고 = 네이티브 전체화면 → 복귀 시 Phaser **resume·포커스** 처리 확인
- 보상 지급은 **"광고 완료" 콜백에서만** (도중 닫으면 미지급)

### 추천 진행 순서
1. 폰 실행 안정화 ✅
2. 개인정보처리방침 작성 + Play 개발자 계정 가입
3. AdMob **테스트 광고**로 보상형 먼저 검증
4. RevenueCat으로 **"광고 제거" 1개**부터 결제 흐름 구축
5. 내부 테스트 트랙 업로드 → 라이선스 테스터로 실결제 검증
6. UMP 동의 + 정책 점검 후 정식 출시
