/**
 * 사용자 설정 — 런/세션 간 영속되는 환경 설정. (메타 progression 과 분리: MetaProgress.js)
 *
 * localStorage 키:
 *   lagomorph_settings  { bgmVolume, sfxVolume, bgmMuted, sfxMuted, joystickX, joystickY }
 *
 * 두 가지 책임을 한 모듈에 둔다:
 *   1) 설정값 영속 (load/save + 게터/세터)
 *   2) 오디오 적용 글루 — Phaser sound manager 를 attachSound() 로 받아두고,
 *      BGM/SFX 를 현재 볼륨·음소거 설정에 맞춰 재생한다.
 *
 * ※ 현재 프로젝트에는 음원 에셋이 없다. playSfx/playBgm 은 cache 에 키가 없으면 조용히
 *   무시하므로, 지금 호출해도 안전하고(경고 없음) 추후 음원만 추가하면 그대로 동작한다.
 *
 * 조이스틱 위치는 캔버스(논리 390×844) 좌표로 저장한다. null 이면 InputManager 기본 위치 사용.
 */

import { GAME_W, GAME_H } from '../constants';

const KEY = 'lagomorph_settings';

const DEFAULTS = {
  bgmVolume: 0.7,
  sfxVolume: 0.8,
  bgmMuted:  false,
  sfxMuted:  false,
  joystickX: null,  // null = InputManager 기본 위치
  joystickY: null,
  // A/B 액션 버튼 개별 위치(캔버스 좌표). null = 조이스틱 쪽에 따른 기본 미러 위치.
  aX: null, aY: null,
  bX: null, bY: null,
};

// 슬롯 레이아웃 상수 (AttackManager / UIScene._buildSkillSlots 와 동일)
const SLOT = 56, SLOT_GAP = 10, SLOT_MARGIN = 20;
const SLOT_CY = GAME_H - 130;

let _cache = null;

function load() {
  if (_cache) return _cache;
  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  _cache = { ...DEFAULTS, ...data };
  return _cache;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(load())); } catch {}
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ── 게터 ─────────────────────────────────────────────

export function getBgmVolume() { return load().bgmVolume; }
export function getSfxVolume() { return load().sfxVolume; }
export function isBgmMuted()   { return load().bgmMuted; }
export function isSfxMuted()   { return load().sfxMuted; }

/** 저장된 조이스틱 위치(캔버스 좌표) 또는 null(기본 위치). */
export function getJoystickPos() {
  const s = load();
  if (s.joystickX == null || s.joystickY == null) return null;
  return { x: s.joystickX, y: s.joystickY };
}

/**
 * 조이스틱이 놓인 화면 쪽('left' | 'right'). 기본(미설정)은 'left'.
 * 조이스틱 쪽 = 이동 입력 영역, 반대쪽 = 액션(A/B) 버튼 기본 배치 기준.
 */
export function getJoystickSide() {
  const s = load();
  if (s.joystickX == null) return 'left';
  return s.joystickX < GAME_W / 2 ? 'left' : 'right';
}

/** slot('A'|'B') 의 기본 위치 — 커스텀 미설정 시 조이스틱 반대쪽에 미러 배치. */
export function getDefaultSlotPos(slot) {
  const i    = slot === 'A' ? 0 : 1;
  const side = getJoystickSide();
  const x = side === 'left'
    ? GAME_W - SLOT_MARGIN - SLOT / 2 - (SLOT + SLOT_GAP) * i   // 조이스틱 좌측 → 슬롯 우측 (A=342, B=276)
    : SLOT_MARGIN + SLOT / 2 + (SLOT + SLOT_GAP) * i;           // 조이스틱 우측 → 슬롯 좌측 (A=48, B=114)
  return { x, y: SLOT_CY };
}

/** slot('A'|'B') 의 현재 위치 — 커스텀 위치가 있으면 그것을, 없으면 기본 미러 위치. */
export function getSlotPos(slot) {
  const s = load();
  if (slot === 'A' && s.aX != null && s.aY != null) return { x: s.aX, y: s.aY };
  if (slot === 'B' && s.bX != null && s.bY != null) return { x: s.bX, y: s.bY };
  return getDefaultSlotPos(slot);
}

/**
 * 포인터가 A/B 액션 버튼 히트 영역 안인지. 조이스틱 _onDown 에서 액션 버튼 탭을
 * 가로채지 않도록(버튼이 조이스틱 쪽에 놓인 경우 대비) 사용한다.
 */
export function isInActionSlot(px, py) {
  for (const slot of ['A', 'B']) {
    const c = getSlotPos(slot);
    if (Math.abs(px - c.x) <= SLOT / 2 && Math.abs(py - c.y) <= SLOT / 2) return true;
  }
  return false;
}

// ── 세터 ─────────────────────────────────────────────

export function setBgmVolume(v) { load().bgmVolume = clamp01(v); save(); _applyBgm(); }
export function setSfxVolume(v) { load().sfxVolume = clamp01(v); save(); }
export function setBgmMuted(m)  { load().bgmMuted  = !!m;        save(); _applyBgm(); }
export function setSfxMuted(m)  { load().sfxMuted  = !!m;        save(); }

export function setJoystickPos(x, y) {
  const s = load();
  s.joystickX = Math.round(x);
  s.joystickY = Math.round(y);
  save();
}

export function resetJoystickPos() {
  const s = load();
  s.joystickX = null;
  s.joystickY = null;
  save();
}

export function setSlotPos(slot, x, y) {
  const s = load();
  if (slot === 'A') { s.aX = Math.round(x); s.aY = Math.round(y); }
  else              { s.bX = Math.round(x); s.bY = Math.round(y); }
  save();
}

/** 컨트롤 배치(조이스틱·A·B) 전체를 기본값으로 되돌린다. */
export function resetLayout() {
  const s = load();
  s.joystickX = s.joystickY = null;
  s.aX = s.aY = s.bX = s.bY = null;
  save();
}

// ── 오디오 적용 글루 ──────────────────────────────────

let _sound  = null;  // Phaser.Sound.BaseSoundManager (game 전역 공유)
let _bgm    = null;  // 현재 재생 중인 BGM 인스턴스

/** 게임 부팅 시 1회 호출 — sound manager 참조 보관. */
export function attachSound(soundManager) { _sound = soundManager; }

const _hasAudio = (key) => !!_sound && _sound.game.cache.audio.exists(key);

/**
 * 효과음 재생. SFX 음소거 시 무시. config.volume(0~1) 에 SFX 볼륨을 곱해 적용.
 * 음원이 로드되지 않았으면 조용히 null 반환.
 */
export function playSfx(key, config = {}) {
  if (isSfxMuted() || !_hasAudio(key)) return null;
  return _sound.play(key, { ...config, volume: (config.volume ?? 1) * getSfxVolume() });
}

/**
 * 배경음 재생(기본 loop). 이미 재생 중인 BGM 은 정지/해제 후 교체.
 * 볼륨·음소거는 현재 설정값으로 적용되며, 설정 변경 시 _applyBgm() 으로 실시간 반영된다.
 */
export function playBgm(key, config = {}) {
  if (!_hasAudio(key)) return;
  stopBgm();
  _bgm = _sound.add(key, { loop: true, ...config });
  _bgm.setVolume(getBgmVolume());
  _bgm.setMute(isBgmMuted());
  _bgm.play();
}

export function stopBgm() {
  if (_bgm) { _bgm.stop(); _bgm.destroy(); _bgm = null; }
}

function _applyBgm() {
  if (!_bgm) return;
  _bgm.setVolume(getBgmVolume());
  _bgm.setMute(isBgmMuted());
}
