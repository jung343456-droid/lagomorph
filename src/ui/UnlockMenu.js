/**
 * 영구 해금 트리 UI — GAME OVER / ZONE CLEAR 화면에서 "영구 해금" 버튼으로 진입.
 *
 * 레이아웃: 3 컬럼(공격/생존/특수) × N 행 카드 그리드. 행 수가 늘면 그리드 영역을 스크롤뷰로 표시.
 *   잠금(선행 미해금): 회색
 *   구매 가능        : 황색 테두리
 *   잔량 부족        : 회색 + 빨강 가격
 *   해금 완료        : 청록 채움
 *
 * 스크롤뷰:
 *   - 고정 영역: 배경, 타이틀, 메타 코어, 닫기 버튼, 컬럼 헤더.
 *   - 스크롤 영역: 카드 그리드 — Container + GeometryMask. 컨테이너 로컬 좌표로 카드 배치.
 *   - 입력: scene 글로벌 pointerdown/move/up 으로 드래그 처리 (임계값 초과 시 클릭 무효 → 스크롤), wheel 휠 스크롤.
 *   - 우측 인디케이터: 콘텐츠가 마스크보다 길 때만 표시.
 *
 * 닫기: 우측 상단 ✕ 버튼 또는 ESC 키.
 * 모든 game object 는 dispose() 에서 명시적으로 정리한다.
 */

import Phaser from 'phaser';
import { BRANCHES, BRANCH_LABELS, nodesByBranch } from '../data/UnlockTree';
import {
  getMetaCores, purchaseNode, nodeStatus, computeUnlockStats,
} from '../data/MetaProgress';
import { GAME_W, GAME_H } from '../constants';

const DEPTH_BG        = 200;
const DEPTH_PANEL     = 201;
const DEPTH_TEXT      = 202;
const DEPTH_INDICATOR = 203;

const PANEL_PAD     = 16;
const TITLE_Y       = 36;
const CORE_Y        = 64;
const HEADER_Y      = 100;
const GRID_VIEW_TOP = 120;       // 스크롤 마스크 상단
const GRID_VIEW_H   = 560;       // 스크롤 마스크 높이 — 5행(520) + 여유. 향후 노드 추가 시도 자동 스크롤
const ROW_GAP       = 8;
const CARD_H        = 96;
const CLOSE_BTN_R   = 18;
const DRAG_THRESHOLD = 6;        // 이 픽셀 이상 이동하면 드래그로 간주 → 카드 클릭 무효
const WHEEL_FACTOR   = 0.5;

const IND_TRACK_W   = 4;
const IND_TRACK_X   = GAME_W - 8;
const COLOR_IND_TRACK = 0x222222;
const COLOR_IND_THUMB = 0x4ecca3;

const COLOR_OWNED         = { fill: 0x1f3a30, stroke: 0x4ecca3, name: '#88eecc', desc: '#557777', cost: '#4ecca3' };
const COLOR_AVAILABLE     = { fill: 0x2a2418, stroke: 0xddaa44, name: '#ffe9bb', desc: '#aa9977', cost: '#ffcc44' };
const COLOR_UNAFFORDABLE  = { fill: 0x1a1a1a, stroke: 0x555555, name: '#777777', desc: '#555555', cost: '#cc4444' };
const COLOR_LOCKED        = { fill: 0x141414, stroke: 0x333333, name: '#555555', desc: '#333333', cost: '#444444' };

const STATUS_COLORS = {
  owned:        COLOR_OWNED,
  available:    COLOR_AVAILABLE,
  unaffordable: COLOR_UNAFFORDABLE,
  locked:       COLOR_LOCKED,
};

export default class UnlockMenu {
  constructor(scene, onClose) {
    this.scene   = scene;
    this.onClose = onClose;
    this.alive   = true;

    this._fixedEls   = [];   // 고정 영역 게임오브젝트들
    this._cardEls    = [];   // 스크롤 컨테이너 내부 카드 요소 — 재빌드 시 destroy
    this._cards      = [];   // [{ id, bg, cost, status }] — pointerup 시 활성 카드 판별
    this._container  = null;
    this._maskGfx    = null;
    this._scrollZone = null;
    this._indTrack   = null;
    this._indThumb   = null;
    this._coreText   = null;

    this._maxScroll  = 0;    // 양수, 위로 더 스크롤 가능한 최대량
    this._totalH     = 0;    // 카드 그리드 전체 높이

    // 드래그 상태
    this._dragStartY = null;
    this._dragLastY  = null;
    this._dragged    = false;
    this._activeCard = null;

    // scene-level handlers (off() 시 동일 참조 필요)
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp   = this._onPointerUp.bind(this);
    this._onWheel       = this._onWheel.bind(this);
    this._escHandler    = () => this.close();

    this._build();
  }

  // ── public ──────────────────────────────────────────

  close() {
    if (!this.alive) return;
    this.alive = false;
    this._destroyAll();
    this.scene.input.keyboard.off('keydown-ESC', this._escHandler);
    this.scene.input.off('pointermove', this._onPointerMove, this);
    this.scene.input.off('pointerup',   this._onPointerUp,   this);
    this.scene.input.off('wheel',       this._onWheel,       this);
    this.onClose?.();
  }

  // ── build ───────────────────────────────────────────

  _build() {
    // 전체 배경 — 클릭 흡수용
    const fullBg = this.scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.94)
      .setOrigin(0).setScrollFactor(0).setDepth(DEPTH_BG)
      .setInteractive();
    this._fixedEls.push(fullBg);

    // 타이틀
    this._fixedEls.push(this.scene.add.text(GAME_W / 2, TITLE_Y, '영구 해금', {
      fontSize: '24px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_TEXT));

    // 메타 코어 잔량
    this._coreText = this.scene.add.text(GAME_W / 2, CORE_Y, `◆ ${getMetaCores()}`, {
      fontSize: '18px', color: '#ffcc44', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_TEXT);
    this._fixedEls.push(this._coreText);

    // 닫기 버튼
    const closeBg = this.scene.add.rectangle(GAME_W - 30, 30, CLOSE_BTN_R * 2, CLOSE_BTN_R * 2, 0x222222)
      .setStrokeStyle(2, 0x888888).setScrollFactor(0).setDepth(DEPTH_PANEL)
      .setInteractive({ cursor: 'pointer' });
    const closeTxt = this.scene.add.text(GAME_W - 30, 30, '✕', {
      fontSize: '18px', color: '#cccccc', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_TEXT);
    closeBg.on('pointerdown', () => this.close());
    closeBg.on('pointerover', () => closeBg.setFillStyle(0x3a3a3a));
    closeBg.on('pointerout',  () => closeBg.setFillStyle(0x222222));
    this._fixedEls.push(closeBg, closeTxt);

    // ESC 키
    this.scene.input.keyboard.on('keydown-ESC', this._escHandler);

    // 컬럼 헤더 (고정)
    const colW = (GAME_W - PANEL_PAD * 2) / BRANCHES.length;
    BRANCHES.forEach((branch, ci) => {
      const cx = PANEL_PAD + colW * ci + colW / 2;
      this._fixedEls.push(this.scene.add.text(cx, HEADER_Y, BRANCH_LABELS[branch], {
        fontSize: '15px', color: '#aaaaaa', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_TEXT));
    });

    // 스크롤 컨테이너 (카드 그리드)
    this._container = this.scene.add.container(0, GRID_VIEW_TOP)
      .setScrollFactor(0).setDepth(DEPTH_PANEL);

    // 마스크 — make.graphics 는 displayList 에 add 되지 않아 보이지 않음
    this._maskGfx = this.scene.make.graphics({});
    this._maskGfx.fillStyle(0xffffff);
    this._maskGfx.fillRect(0, GRID_VIEW_TOP, GAME_W, GRID_VIEW_H);
    this._container.setMask(this._maskGfx.createGeometryMask());

    // 카드 그리드 구성
    this._buildCards(colW);

    // 스크롤 입력 Zone — 마스크 영역 전체에 깔리는 투명 영역.
    // 카드가 컨테이너에 들어있으므로 Zone 보다 displayList 상위 → 카드 위에서 pointerdown 은 카드가 먼저 받음.
    this._scrollZone = this.scene.add.zone(0, GRID_VIEW_TOP, GAME_W, GRID_VIEW_H)
      .setOrigin(0).setScrollFactor(0).setDepth(DEPTH_PANEL - 1)
      .setInteractive();
    this._scrollZone.on('pointerdown', (p) => this._beginDrag(p, null));

    // 인디케이터
    this._buildIndicator();

    // 글로벌 입력 핸들러
    this.scene.input.on('pointermove', this._onPointerMove, this);
    this.scene.input.on('pointerup',   this._onPointerUp,   this);
    this.scene.input.on('wheel',       this._onWheel,       this);
  }

  _buildCards(colW) {
    const currentStats = computeUnlockStats();
    let maxRows = 0;
    BRANCHES.forEach((branch, ci) => {
      const cx = PANEL_PAD + colW * ci + colW / 2;
      const cardW = colW - 10;
      const nodes = nodesByBranch(branch);
      if (nodes.length > maxRows) maxRows = nodes.length;
      nodes.forEach(([id, node], ri) => {
        // 컨테이너 로컬 y — 0 부터 시작
        const cy = ri * (CARD_H + ROW_GAP) + CARD_H / 2;
        this._buildNodeCard(id, node, cx, cy, cardW, CARD_H, currentStats);
      });
    });
    this._totalH    = maxRows * (CARD_H + ROW_GAP) - ROW_GAP;
    this._maxScroll = Math.max(0, this._totalH - GRID_VIEW_H);
  }

  _buildNodeCard(id, node, cx, cy, w, h, currentStats) {
    const status = nodeStatus(id);
    const c = STATUS_COLORS[status];

    const bg = this.scene.add.rectangle(cx, cy, w, h, c.fill)
      .setStrokeStyle(2, c.stroke);

    const name = this.scene.add.text(cx, cy - h / 2 + 14, node.name, {
      fontSize: '12px', color: c.name, fontFamily: 'monospace', fontStyle: 'bold',
      wordWrap: { width: w - 10 }, align: 'center',
    }).setOrigin(0.5, 0);

    let descStr;
    if (status === 'owned') {
      descStr = node.desc.replace(/\s*\([^)]*\)\s*$/, '').trim();
    } else if (node.dynDesc && currentStats) {
      descStr = node.dynDesc(currentStats);
    } else {
      descStr = node.desc;
    }
    const desc = this.scene.add.text(cx, cy - 4, descStr, {
      fontSize: '10px', color: c.desc, fontFamily: 'monospace',
      wordWrap: { width: w - 10 }, align: 'center',
    }).setOrigin(0.5, 0);

    const costStr = status === 'owned' ? '보유' : `◆ ${node.cost}`;
    const cost = this.scene.add.text(cx, cy + h / 2 - 10, costStr, {
      fontSize: '12px', color: c.cost, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 1);

    this._container.add([bg, name, desc, cost]);
    this._cardEls.push(bg, name, desc, cost);

    // 구매 가능 / 잔량 부족 상태만 인터랙티브
    if (status === 'available' || status === 'unaffordable') {
      bg.setInteractive({ cursor: 'pointer' });
      bg.on('pointerdown', (p) => this._beginDrag(p, { id, costRef: cost, bg, status, fill: c.fill }));
    }
    this._cards.push({ id, bg, cost, status });
  }

  _buildIndicator() {
    if (this._maxScroll <= 0) return; // 스크롤 불가 시 인디케이터 자체 생략
    this._indTrack = this.scene.add.rectangle(IND_TRACK_X, GRID_VIEW_TOP, IND_TRACK_W, GRID_VIEW_H, COLOR_IND_TRACK)
      .setOrigin(0).setScrollFactor(0).setDepth(DEPTH_INDICATOR);
    const thumbH = Math.max(24, Math.round(GRID_VIEW_H * (GRID_VIEW_H / this._totalH)));
    this._indThumb = this.scene.add.rectangle(IND_TRACK_X, GRID_VIEW_TOP, IND_TRACK_W, thumbH, COLOR_IND_THUMB)
      .setOrigin(0).setScrollFactor(0).setDepth(DEPTH_INDICATOR);
    this._updateIndicator();
  }

  _updateIndicator() {
    if (!this._indThumb || this._maxScroll <= 0) return;
    const scrollOffset = GRID_VIEW_TOP - this._container.y; // 0 ~ maxScroll
    const thumbH = this._indThumb.height;
    const range = GRID_VIEW_H - thumbH;
    const ratio = this._maxScroll > 0 ? scrollOffset / this._maxScroll : 0;
    this._indThumb.y = GRID_VIEW_TOP + ratio * range;
  }

  // ── 입력 ────────────────────────────────────────────

  _beginDrag(p, card) {
    // 카드 hit area 는 컨테이너 transform 을 따라가지만 마스크는 시각만 클립한다.
    // 마스크 영역 밖에서 발생한 카드 클릭(스크롤된 카드가 헤더 영역에 위치)은 구매로 인정하지 않는다.
    if (card && (p.y < GRID_VIEW_TOP || p.y > GRID_VIEW_TOP + GRID_VIEW_H)) {
      card = null;
    }
    this._dragStartY = p.y;
    this._dragLastY  = p.y;
    this._dragged    = false;
    this._activeCard = card;
  }

  _onPointerMove(p) {
    if (this._dragStartY == null) return;
    const dy = p.y - this._dragLastY;
    this._dragLastY = p.y;
    if (!this._dragged && Math.abs(p.y - this._dragStartY) > DRAG_THRESHOLD) {
      this._dragged = true;
    }
    if (this._dragged && this._maxScroll > 0) {
      const minY = GRID_VIEW_TOP - this._maxScroll;
      this._container.y = Phaser.Math.Clamp(this._container.y + dy, minY, GRID_VIEW_TOP);
      this._updateIndicator();
    }
  }

  _onPointerUp(_p) {
    if (this._dragStartY == null) return;
    const card = this._activeCard;
    const wasDragged = this._dragged;
    this._dragStartY = null;
    this._dragLastY  = null;
    this._activeCard = null;
    this._dragged    = false;
    if (!wasDragged && card) {
      this._attemptPurchase(card.id, card.costRef);
    }
  }

  _onWheel(_pointer, _objs, _dx, dy) {
    if (this._maxScroll <= 0) return;
    const minY = GRID_VIEW_TOP - this._maxScroll;
    this._container.y = Phaser.Math.Clamp(this._container.y - dy * WHEEL_FACTOR, minY, GRID_VIEW_TOP);
    this._updateIndicator();
  }

  // ── 구매 ────────────────────────────────────────────

  _attemptPurchase(id, costRef) {
    const ok = purchaseNode(id);
    if (!ok) {
      this.scene.tweens.add({
        targets: costRef, scaleX: 1.25, scaleY: 1.25,
        duration: 90, yoyo: true, ease: 'Quad.Out',
      });
      const prevColor = costRef.style.color;
      costRef.setColor('#ff4444');
      this.scene.time.delayedCall(180, () => {
        if (costRef.active) costRef.setColor(prevColor);
      });
      return;
    }
    // 성공 — 스크롤 위치 유지하면서 카드만 재빌드
    this._rebuildCards();
    this._coreText?.setText(`◆ ${getMetaCores()}`);
  }

  _rebuildCards() {
    // 카드 요소만 정리 (컨테이너/마스크/인디케이터/Zone 은 유지)
    this._cardEls.forEach(el => { if (el?.active) el.destroy(); });
    this._cardEls = [];
    this._cards   = [];

    const colW = (GAME_W - PANEL_PAD * 2) / BRANCHES.length;
    this._buildCards(colW);

    // 새 maxScroll 에 맞춰 컨테이너 y 클램프
    const minY = GRID_VIEW_TOP - this._maxScroll;
    this._container.y = Phaser.Math.Clamp(this._container.y, minY, GRID_VIEW_TOP);

    // 인디케이터 갱신 (있으면 thumb 높이 재산정)
    if (this._indThumb) {
      const thumbH = Math.max(24, Math.round(GRID_VIEW_H * (GRID_VIEW_H / this._totalH)));
      this._indThumb.height = thumbH;
      this._updateIndicator();
    }
  }

  // ── 정리 ────────────────────────────────────────────

  _destroyAll() {
    this._fixedEls.forEach(el => { if (el?.active) el.destroy(); });
    this._fixedEls = [];
    if (this._container?.active) this._container.destroy(true); // 자식 카드 포함 destroy
    this._container = null;
    if (this._maskGfx?.active) this._maskGfx.destroy();
    this._maskGfx = null;
    if (this._scrollZone?.active) this._scrollZone.destroy();
    this._scrollZone = null;
    if (this._indTrack?.active) this._indTrack.destroy();
    if (this._indThumb?.active) this._indThumb.destroy();
    this._indTrack = null;
    this._indThumb = null;
    this._cardEls  = [];
    this._cards    = [];
    this._coreText = null;
  }
}
