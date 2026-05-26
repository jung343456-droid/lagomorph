/**
 * 영구 해금 트리 UI — GAME OVER / ZONE CLEAR 화면에서 "영구 해금" 버튼으로 진입.
 *
 * 레이아웃: 3 컬럼(공격/생존/특수) × 4 행 카드 그리드.
 *   잠금(선행 미해금): 회색
 *   구매 가능        : 황색 테두리
 *   잔량 부족        : 회색 + 빨강 가격
 *   해금 완료        : 청록 채움
 *
 * 닫기: 우측 상단 ✕ 버튼 또는 ESC 키.
 * 모든 game object 는 dispose() 에서 명시적으로 정리한다.
 */

import { UNLOCK_NODES, BRANCHES, BRANCH_LABELS, nodesByBranch } from '../data/UnlockTree';
import {
  getMetaCores, getUnlockedNodes, purchaseNode, nodeStatus,
} from '../data/MetaProgress';
import { GAME_W, GAME_H } from '../constants';

const DEPTH_BG    = 200;
const DEPTH_PANEL = 201;
const DEPTH_TEXT  = 202;

const PANEL_PAD     = 16;
const TITLE_Y       = 36;
const CORE_Y        = 64;
const HEADER_Y      = 100;
const GRID_TOP      = 120;
const ROW_GAP       = 8;
const CARD_H        = 96;
const CLOSE_BTN_R   = 18;

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
    this._els    = [];          // 모든 game object — dispose 시 일괄 destroy
    this._escHandler = null;

    this._build();
  }

  // ── public ──────────────────────────────────────────

  close() {
    if (!this.alive) return;
    this.alive = false;
    this._destroyEls();
    if (this._escHandler) {
      this.scene.input.keyboard.off('keydown-ESC', this._escHandler);
      this._escHandler = null;
    }
    this.onClose?.();
  }

  // ── private ─────────────────────────────────────────

  _build() {
    // 전체 배경 — 클릭 흡수용으로 setInteractive 처리해서 하단 GAME OVER 버튼 차단
    const fullBg = this.scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.94)
      .setOrigin(0).setScrollFactor(0).setDepth(DEPTH_BG)
      .setInteractive();
    this._els.push(fullBg);

    // 타이틀
    this._els.push(this.scene.add.text(GAME_W / 2, TITLE_Y, '영구 해금', {
      fontSize: '24px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_TEXT));

    // 메타 코어 잔량
    this._coreText = this.scene.add.text(GAME_W / 2, CORE_Y, `◆ ${getMetaCores()}`, {
      fontSize: '18px', color: '#ffcc44', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_TEXT);
    this._els.push(this._coreText);

    // 닫기 버튼 (우측 상단)
    const closeBg = this.scene.add.rectangle(GAME_W - 30, 30, CLOSE_BTN_R * 2, CLOSE_BTN_R * 2, 0x222222)
      .setStrokeStyle(2, 0x888888).setScrollFactor(0).setDepth(DEPTH_PANEL)
      .setInteractive({ cursor: 'pointer' });
    const closeTxt = this.scene.add.text(GAME_W - 30, 30, '✕', {
      fontSize: '18px', color: '#cccccc', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_TEXT);
    closeBg.on('pointerdown', () => this.close());
    closeBg.on('pointerover', () => closeBg.setFillStyle(0x3a3a3a));
    closeBg.on('pointerout',  () => closeBg.setFillStyle(0x222222));
    this._els.push(closeBg, closeTxt);

    // ESC 키
    this._escHandler = () => this.close();
    this.scene.input.keyboard.on('keydown-ESC', this._escHandler);

    // 컬럼 헤더 + 카드 그리드
    const colW = (GAME_W - PANEL_PAD * 2) / BRANCHES.length;
    BRANCHES.forEach((branch, ci) => {
      const cx = PANEL_PAD + colW * ci + colW / 2;
      this._els.push(this.scene.add.text(cx, HEADER_Y, BRANCH_LABELS[branch], {
        fontSize: '15px', color: '#aaaaaa', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_TEXT));

      const cardW = colW - 10;
      nodesByBranch(branch).forEach(([id, node], ri) => {
        const cy = GRID_TOP + ri * (CARD_H + ROW_GAP) + CARD_H / 2;
        this._buildNodeCard(id, node, cx, cy, cardW, CARD_H);
      });
    });
  }

  _buildNodeCard(id, node, cx, cy, w, h) {
    const status = nodeStatus(id);
    const c = STATUS_COLORS[status];

    const bg = this.scene.add.rectangle(cx, cy, w, h, c.fill)
      .setStrokeStyle(2, c.stroke).setScrollFactor(0).setDepth(DEPTH_PANEL);

    const name = this.scene.add.text(cx, cy - h / 2 + 14, node.name, {
      fontSize: '12px', color: c.name, fontFamily: 'monospace', fontStyle: 'bold',
      wordWrap: { width: w - 10 }, align: 'center',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH_TEXT);

    const desc = this.scene.add.text(cx, cy - 4, node.desc, {
      fontSize: '10px', color: c.desc, fontFamily: 'monospace',
      wordWrap: { width: w - 10 }, align: 'center',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH_TEXT);

    const costStr = status === 'owned' ? '보유' : `◆ ${node.cost}`;
    const cost = this.scene.add.text(cx, cy + h / 2 - 10, costStr, {
      fontSize: '12px', color: c.cost, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH_TEXT);

    this._els.push(bg, name, desc, cost);

    // 구매 가능 / 잔량 부족 상태만 인터랙티브 (잠금·보유 노드는 비활성)
    if (status === 'available' || status === 'unaffordable') {
      bg.setInteractive({ cursor: 'pointer' });
      bg.on('pointerdown', () => this._attemptPurchase(id, cost));
      bg.on('pointerover', () => bg.setFillStyle(status === 'available' ? 0x3a3322 : 0x2a1a1a));
      bg.on('pointerout',  () => bg.setFillStyle(c.fill));
    }
  }

  _attemptPurchase(id, costRef) {
    const ok = purchaseNode(id);
    if (!ok) {
      // 실패 — 가격 빨강 깜빡 + 살짝 스케일
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
    // 성공 — 메뉴 재빌드 (코어 잔량 + 노드 상태 모두 갱신)
    this._rebuild();
  }

  _rebuild() {
    this._destroyEls();
    if (this._escHandler) {
      this.scene.input.keyboard.off('keydown-ESC', this._escHandler);
      this._escHandler = null;
    }
    this._build();
  }

  _destroyEls() {
    this._els.forEach(el => { if (el?.active) el.destroy(); });
    this._els = [];
    this._coreText = null;
  }
}
