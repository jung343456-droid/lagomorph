import Phaser from 'phaser';
import { GAME_W, GAME_H, HUD_H, zoneOf, displayFloor, MAX_FLOOR, MAX_ZONE, zonePriceMult } from '../constants';
import Player from '../entities/Player';
import InputManager from '../utils/InputManager';
import AttackManager from '../systems/AttackManager';
import EnemyManager from '../systems/EnemyManager';
import { generateDungeon, pickPriceWeightedDrop } from '../world/DungeonGenerator';
import RoomManager from '../world/RoomManager';
import { ROOM_W, ROOM_H, CHEST_GRIM_X, CHEST_GRIM_Y } from '../world/Room';
import PassiveItem, { ITEM_DEFS } from '../entities/PassiveItem';
import Shopkeeper from '../entities/Shopkeeper';
import Altar from '../entities/Altar';
import MemoryTape from '../entities/MemoryTape';
import { getMetaCores, beginMetaRun, commitMetaRun, addRunPickup, getGrimIntroShown, markGrimIntroShown, markVaultDiscovered, hasSeenDialogue, markDialogueSeen } from '../data/MetaProgress';
import { saveRunState, loadRunSave, clearRunSave } from '../data/SaveManager';
import { randomGrimTip } from '../data/GrimDialogue';

// 상자(stump) 파괴 시 코어 드롭 수량 가중표 — 1~5는 흔하게, 10·20은 아주 낮은 확률.
const BOX_CORE_TABLE = [
  { count: 1, weight: 30 }, { count: 2, weight: 25 }, { count: 3, weight: 20 },
  { count: 4, weight: 12 }, { count: 5, weight: 8 },  { count: 10, weight: 4 }, { count: 20, weight: 1 },
];

const GRIM_FIRST_LINES = [
  '잠깐. 거기 서봐.',
  '...자네, 토끼인가.',
  ' 내가 이 입구 근처까지 내려온 게 얼마만인지. 아직 끝나지 않은 건가..',
  '이대로 있을 수는 없겠어. 거래를 하지. 코어를 가져오게. 자네가 살아남는 데 도움이 될 거야.',
  '필요한건 코어뿐이야. 이 지하에선 그게 전부지 — 돈이고, 목숨이고. 기억이기도 해. 그냥 그렇다고.',
];

// 신규 런으로 1층 진입 시 도입 대사 — LAGO-7 이 사냥꾼에게 가족을 잃던 밤의 꿈을 회상한다.
// (이 기억이 거짓일 수 있다는 단서는 기억 보관실에서 단계적으로 드러난다 — 지금은 진실로 믿는다.)
const FLOOR1_INTRO_LINES = [
  '... 또 그 꿈이다.',
  '풀숲이 짓밟히고 굴이 무너지던 밤.\n사냥꾼의 그림자가 달빛을 가렸다.',
  '나는 숨어서 보았다. 가족이 하나씩\n그 두 발 달린 것의 손에 끌려가는 것을.\n아무도 돌아오지 않았다.',
  '인간. 그 냄새도, 그 눈도 잊지 못한다.\n잊을 수가 없다.',
  '약했기 때문이다. 그래서 빼앗겼다.\n다시는 그렇게 두지 않는다.',
  '강해져야 한다. 놈을 완전히 찢어놓을 만큼.',
];

// 구역 3 보스 처치 후 대화창 — 마침내 복수를 이루었으나 허무함이 간접적으로 드러나는 독백
const ZONE3_BOSS_CLEAR_LINES = [
  '쓰러졌다.\n마침내, 쓰러졌다.',
  '그 밤이 떠오른다.\n달빛이 가려지고 굴이 무너지던 소리,\n이름을 잃어버린 얼굴들.',
  '이 손으로, 직접 끝을 냈다.\n복수는 이루어졌다.',
  '...........................................................',
  '........................',
];

// 구역 4 보스 처치 후 대화창 — 사냥꾼의 정체 자각, 스파크·침묵·고철로 은유적 표현
const ZONE4_BOSS_CLEAR_LINES = [
  '사냥꾼이 쓰러진다.\n굉음이 울렸다. 몸에서 전기 스파크가 튀었다.',
  '내가 뭘 보고 있는 거지?',
  '.......',
  '신호가 사라졌다.\n남은 건 차갑게 식은 금속 피부에서 흐르는 침묵뿐.',
];


export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create(data) {
    // scene.restart() 시 Phaser 3.60 은 이 씬의 이벤트 리스너를 자동 정리하지 않는다.
    // 이 씬에서 등록한 사용자 이벤트들을 명시적으로 비워야 listener 중복 등록을 막을 수 있다.
    ['boss-cleared', 'floor-exit-ready', 'room-entered', 'shop-open-requested', 'floor-changed',
     'all-enemies-dead', 'elite-killed', 'vault-entered', 'secret-cache-entered', 'altar-open-requested',
     'grave-grim-near']
      .forEach(e => this.events.off(e));
    if (this.roomManager) this.roomManager.destroy();

    // 이어하기 — data.restore + 유효 저장본이 있을 때만 복원 모드. _restoring 동안 자동저장 차단.
    const save = data?.restore ? loadRunSave() : null;
    this._restoring = !!save;

    this.player        = new Player(this, ROOM_W / 2, ROOM_H / 2);
    this.input$        = new InputManager(this);
    this.enemyManager  = new EnemyManager(this, this.player);
    this.attackManager = new AttackManager(this, this.player);

    // 기본 제공 코어 + 점화의 잔해 추가 코어를 메타 픽업에 합산 (신규 런만 — 복원은 코어를 저장값으로 덮어씀)
    if (!save) {
      addRunPickup(this.enemyManager.coreCount);
      if (this.player.startingCores > 0) {
        this.enemyManager.coreCount += this.player.startingCores;
        addRunPickup(this.player.startingCores);
      }
    }

    // 시작 층 — 복원이면 저장값, 아니면 data.startFloor(허브 '누군가의 기억'에서 보관실 층으로 바로 진입)
    // 이 있으면 그 층, 없으면 1층. startFloor 는 1~MAX_FLOOR 로 클램프.
    this.currentFloor = save
      ? save.currentFloor
      : Phaser.Math.Clamp(Math.floor(data?.startFloor ?? 1), 1, MAX_FLOOR);

    // '누군가의 기억'으로 깊은 층에서 시작하면 시작 아이템을 추가 지급 — 기본 수에 더해
    // 3개 층당 1개씩(floor/3): 6층 +2, 16층 +5, 26층 +8, 36층 +12. 일반 1층 시작·복원은 0.
    this._memoryStartBonus = (!save && (data?.startFloor ?? 1) > 1)
      ? Math.floor(this.currentFloor / 3)
      : 0;

    // 던전 생성 → 첫 방 진입 (복원 모드는 아래 복원 블록에서 저장된 던전으로 진입)
    this.roomManager = new RoomManager(this, this.player, this.enemyManager);
    this.roomManager.setFloor(this.currentFloor);
    if (!save) {
      this.roomManager.init(generateDungeon(
        this.currentFloor, undefined, this._ownedItemIds(),
        this.player.shopSlotBonus ?? 0,
        (this.player.shopPriceMult ?? 1) * zonePriceMult(this.currentFloor),
      ));
    }

    // 상점방 NPC (현재 방이 'shop' 일 때만 살아 있음)
    this._shopkeeper = null;
    this._grimMet    = false;  // 런 단위 상점 재진입 방지 (전체 1회 여부는 MetaProgress 관리)

    // 시작 방 아이템 — 신규 런만. 복원 시 저장된 바닥 아이템은 복원 블록에서 재생성
    this._passiveItems = [];
    if (!save) this._spawnStartRoomItem();

    // 계단 상태 (아래층 진입 트리거 — A 버튼 입력 필요)
    this._stairs           = null;
    this._altar            = null;   // 코어 제단 — 제단 비밀방(secret_cache/altar) 진입 시 스폰, 떠나면 정리 (room-entered 핸들러)
    this._altarSlots       = null;   // 이번 층 제단 슬롯 — 층 진입 첫 방문 시 추첨, 층 전환 시 초기화
    this._memoryTape       = null;   // '누군가의 기억' 테이프 — 기억 보관실(secret_vault) 중앙에 스폰, 떠나면 정리 (room-entered 핸들러)
    this._graveGrim        = null;   // 상자방(공동묘지) GRIM — 탁자·상점 없음, 근접 시 "....." 만 표시 (room-entered 핸들러)
    this._stairsRoomId     = null;
    this._stairsPos        = null;
    this._stairsTriggered  = false;
    this._stairsNear       = false;

    // 엔드 스크린 — scene.restart() 시 게임 오브젝트는 파괴되지만 인스턴스 프로퍼티는 잔존하므로 명시 리셋
    this._endScreenEls    = null;
    // 런 픽업 카운터 — 신규 런은 0으로 리셋, 복원 런은 저장된 픽업분을 복구.
    // 픽업분은 종료 시 commitMetaRun() 으로 정산(보존율 모델).
    beginMetaRun();
    if (save) addRunPickup(save.meta?.runPicked ?? 0);

    // 보스 클리어: 패시브 드롭 + 계단 표시 / 구역 전환 / 런 종료 (모두 displayFloor·zoneOf 기준).
    //   일반 출구방               → 계단
    //   표시 3·8층 (중간보스)      → 레어 아이템 추가 드롭 + 계단
    //   표시 5·10층 (보스)         → 계단. 표시 10층이 구역 경계면(비최종) "ZONE n CLEAR" 안내
    //   30층(구역3 보스)           → 복수 완수 + 허무 독백 대화창 → onComplete 계단+구역 전환
    //   MAX_FLOOR=40(구역4 보스)   → "사냥꾼=로봇" 자각 연출 → ZONE 4 CLEAR (런 종료)
    this.events.on('boss-cleared', ({ x, y, floor, roomId }) => {
      // 실제 보스(표시 5·10층)·중간보스(표시 3·8층) 층에서만 패시브 아이템 드롭.
      const zone = zoneOf(floor);
      const df   = displayFloor(floor);
      const isBossFloor    = df === 5 || df === 10;
      const isMidBossFloor = df === 3 || df === 8;
      if (isBossFloor || isMidBossFloor) this._dropPassiveItem(x, y);

      if (floor === MAX_FLOOR) {
        // 최종 보스(구역 4 표시 10층) — "죽인 사냥꾼이 로봇이었다" 자각 연출 후 런 종료
        this.time.delayedCall(800, () => this._showHunterTruth(zone));
        return;
      }
      // 중간보스(표시 3·8층): 회복 레어 아이템 추가 드롭
      if (isMidBossFloor) this.enemyManager.dropRareItem(x - 40, y);
      // 구역 3 보스(표시 10층, 비최종): 복수 완수 + 허무 독백 → onComplete 에서 계단+구역 전환
      if (zone === 3 && df === 10) {
        this.time.delayedCall(600, () => {
          const ui = this.scene.get('UIScene');
          this.player.halt?.();
          ui.openDialogue?.(ZONE3_BOSS_CLEAR_LINES, () => {
            this._markStairs(roomId, x, y + 90);
            this.time.delayedCall(400, () => this._showZoneTransition(zone + 1));
          }, false, 'PLAYER');
        });
        return;
      }
      this.time.delayedCall(800, () => this._markStairs(roomId, x, y + 90));
      // 구역 경계(표시 10층) 통과 안내
      if (df === 10 && zone < MAX_ZONE) this.time.delayedCall(1200, () => this._showZoneTransition(zone + 1));
    });

    // 엘리트 처치: 보유하지 않은 랜덤 패시브 아이템 드롭
    this.events.on('elite-killed', ({ x, y }) => {
      this._dropPassiveItem(x, y);
    });

    // 부술 수 있는 장애물(stump) 파괴: 단일 추첨 — 50% 꽝 / 45% 코어 / 5% 아이템 (둘 다 안 나옴)
    this.events.on('obstacle-broken', ({ x, y }) => {
      const roll = Math.random();
      if (roll < 0.50) return; // 50% 꽝
      if (roll < 0.95) {
        // 45% 코어 드롭 — 수량은 BOX_CORE_TABLE 가중(1~5 흔함, 10·20 희귀)
        const total = BOX_CORE_TABLE.reduce((s, e) => s + e.weight, 0);
        let r = Math.random() * total;
        let count = BOX_CORE_TABLE[0].count;
        for (const e of BOX_CORE_TABLE) { r -= e.weight; if (r <= 0) { count = e.count; break; } }
        this.enemyManager.dropCores(x, y, count);
        return;
      }
      // 5% 상점 카탈로그 드롭 (가격 역가중)
      const drop = pickPriceWeightedDrop(this._ownedItemIds());
      const safe = this.roomManager?.findSafeDropPos(x, y) ?? { x, y };
      if (drop.kind === 'item') {
        this._passiveItems.push(this._makePassiveItem(safe.x, safe.y, drop.id));
      } else {
        const amount = drop.kind === 'heal'     ? drop.amount
                     : drop.kind === 'heal_pct' ? Math.floor(this.player.maxHp * drop.ratio)
                     :                            this.player.maxHp; // heal_full
        this.enemyManager.dropRareItem(safe.x, safe.y, amount);
      }
    });

    // 기억 보관실 진입 시 대사·발견 기록은 방 중앙의 비디오 테이프(MemoryTape) 근접에서 처리한다
    // (room-entered 핸들러에서 스폰). RoomManager 의 vault-entered 이벤트는 더 이상 구독하지 않는다.

    // 보물방(보관함) 진입: 보상 아이템 스폰
    this.events.on('secret-cache-entered', ({ x, y, reward }) => {
      if (!reward) return;
      if (reward.kind === 'item') {
        this._passiveItems.push(this._makePassiveItem(x, y, reward.id));
      } else {
        this.enemyManager.dropRareItem(x, y);
      }
    });

    // 보스가 없는 층: 일반 방 클리어 시 그 방에 계단 표시
    this.events.on('floor-exit-ready', ({ x, y, floor, roomId }) => {
      if (floor < 3) this.time.delayedCall(500, () => this._markStairs(roomId, x, y));
    });

    // 방 입장 시 계단 가시성 동기화 (다른 방으로 이동하면 계단 숨김, 돌아오면 재생성)
    this.events.on('room-entered', ({ roomData }) => {
      if (this._stairsRoomId !== null) {
        const inStairsRoom = roomData.id === this._stairsRoomId;
        if (inStairsRoom && !this._stairs) {
          this._spawnStairs(this._stairsPos.x, this._stairsPos.y);
        } else if (!inStairsRoom && this._stairs) {
          this._disposeStairs();
        }
      }

      // 코어 제단 방(비밀방 1/4 분기) — 제단방에 있으면 스폰, 떠나면 정리
      const isAltarRoom = roomData.type === 'secret_cache' && roomData.cacheSubtype === 'altar';
      if (isAltarRoom && !this._altar) {
        this._altar = new Altar(this, ROOM_W / 2, ROOM_H / 2);
        // 이번 층 슬롯이 없을 때만 추첨 — 나갔다 들어와도 동일한 목록 유지
        if (!this._altarSlots) {
          this._altarSlots = this.scene.get('UIScene')._rollAltarSlots(1);
        }
      } else if (!isAltarRoom && this._altar) {
        this._altar.dispose();
        this._altar = null;
      }

      // 기억 보관실(ENGRAM VAULT) — 방 중앙에 '누군가의 기억' 테이프 스폰, 떠나면 정리.
      // 가까이 갈 때마다 그 보관실 대사를 재생하고 발견을 영속 기록(Hub 메뉴 해금)한다.
      const isVaultRoom = roomData.type === 'secret_vault';
      if (isVaultRoom && !this._memoryTape) {
        const vIdx = roomData.vaultIdx;
        this._memoryTape = new MemoryTape(this, ROOM_W / 2, ROOM_H / 2, {
          onApproach: () => { markVaultDiscovered(vIdx); this._showVaultText(vIdx); },
        });
      } else if (!isVaultRoom && this._memoryTape) {
        this._memoryTape.dispose();
        this._memoryTape = null;
      }

      // 상점방 NPC 라이프사이클 — 방 바뀔 때마다 기존 NPC 정리 후 필요 시 재생성
      if (this._shopkeeper) { this._shopkeeper.dispose(); this._shopkeeper = null; }
      if (roomData.type === 'shop') {
        this._shopkeeper = new Shopkeeper(
          this, ROOM_W / 2, ROOM_H * 0.32, roomData.shopSlots,
        );
      }

      // 상자방(공동묘지) GRIM — 탁자·상점 없음, 근접 시 "....." 만 표시
      if (this._graveGrim) { this._graveGrim.dispose(); this._graveGrim = null; }
      if (roomData.type === 'secret_cache' && roomData.cacheSubtype === 'chest') {
        this._graveGrim = new Shopkeeper(
          this, CHEST_GRIM_X, CHEST_GRIM_Y, null, 'grave-grim-near', false,
        );
      }

      // 패시브 아이템 — 현재 방 소속만 표시 (다른 방 아이템이 같은 좌표에 보이거나 픽업되는 것 방지)
      const rid = roomData.id;
      for (const item of this._passiveItems) {
        if (!item.alive) continue;
        item.gameObject.setVisible(item.roomId == null || item.roomId === rid);
      }

      // 방 이동 시 자동 저장 (다음 틱 — 방 구성/적 주입 완료 후)
      this.time.delayedCall(0, () => this._autosave());
    });

    // 상점 열기 요청 (Shopkeeper NPC 근접 시 발행)
    this.events.on('shop-open-requested', () => {
      if (!this._shopkeeper) return;
      this.player.halt();  // 대화/상점 진입 시 잔여 속도로 미끄러지는 것 방지
      const ui    = this.scene.get('UIScene');
      const slots = this._shopkeeper.shopSlots;
      // 이 상점 NPC에 처음 다가갔을 때만 대화 — 게임 전체 첫 만남은 인사, 이후엔 랜덤 팁.
      // 같은 방에서 상점을 닫았다 다시 열면 대화 없이 바로 상점.
      if (this._shopkeeper._greeted) { ui.openShop?.(slots); return; }
      this._shopkeeper._greeted = true;
      if (!getGrimIntroShown()) {
        markGrimIntroShown();
        ui.openDialogue?.(GRIM_FIRST_LINES, () => ui.openShop?.(slots));
      } else {
        ui.openDialogue?.(randomGrimTip(), () => ui.openShop?.(slots));
      }
    });

    // 상자방(공동묘지) GRIM 근접 — 판매 없음, "....." 한 줄만 표시. 정체는 게임 내에서 설명하지 않는다.
    this.events.on('grave-grim-near', () => {
      this.player.halt();
      this.scene.get('UIScene').openDialogue?.(['.....']);
    });

    // 코어 제단 열기 요청 (Altar 근접 시 발행) — 상점 오버레이 재사용, 런 한정 강화 구매
    this.events.on('altar-open-requested', () => {
      if (!this._altar) return;
      this.player.halt();  // 진입 시 잔여 속도로 미끄러지는 것 방지
      this.scene.get('UIScene').openAltar?.(this._altarSlots);
    });

    // 카메라 뷰포트를 HUD 아래 영역으로 제한 → 게임/HUD 영역 시각적 분리
    this.cameras.main.setViewport(0, HUD_H, GAME_W, GAME_H - HUD_H);
    this.cameras.main.startFollow(this.player.gameObject, true, 0.08, 0.08);

    // ── 이어하기 복원 ──
    // 이벤트 핸들러 등록 이후(room-entered 로 상점 NPC/미니맵 동기화) + UIScene launch 이전에 수행.
    // 순서: 방 진입(적 스폰 안 함) → 플레이어 좌표/스탯 적용 → 적 주입 → 트랩 복원 → 바닥 아이템/계단.
    if (save) {
      this.roomManager.restore(save.dungeon, save.currentRoomId);
      this.roomManager.restoreRoomDropsFromSave(save.roomDrops);
      this.player.applySave(save.player);
      this.enemyManager.restoreFromSave(save.enemyState);
      this.attackManager.restoreFromSave(save.attackState);
      for (const it of save.floorPassiveItems ?? []) {
        const _pi = new PassiveItem(this, it.x, it.y, it.id);
        _pi.roomId = it.roomId ?? null;
        const _cid = this.roomManager.currentRoomData?.id;
        _pi.gameObject.setVisible(_pi.roomId == null || _pi.roomId === _cid);
        this._passiveItems.push(_pi);
      }
      if (save.stairs) {
        this._markStairs(save.stairs.roomId, save.stairs.x, save.stairs.y);
        this._stairsTriggered = !!save.stairs.triggered;
      }
    }

    this.scene.launch('UIScene', { gameScene: this });

    // 신규 런으로 1층 진입 시 도입 대사 (이어하기·기억 재생 점프 startFloor>1 은 제외).
    // openDialogue 는 UIScene.create 완료 후에만 동작하므로 'create' 이벤트를 기다려 재생한다.
    if (!save && this.currentFloor === 1) {
      // 한 번이라도 본 적 있으면 '건너뛰기' 버튼 노출. 본 직후 영속 기록(다음 런부터 건너뛰기 가능).
      const introSeen = hasSeenDialogue('floor1_intro');
      this.scene.get('UIScene').events.once('create', () => {
        this.player.halt?.();
        this.scene.get('UIScene').openDialogue?.(FLOOR1_INTRO_LINES, null, introSeen, 'PLAYER');
      });
      markDialogueSeen('floor1_intro');
    }

    // 디버그: 숫자 1 → 누를 때마다 다음 층으로 이동
    this.input.keyboard.on('keydown-ONE', () => {
      if (this.currentFloor >= MAX_FLOOR) return;
      this._advanceFloor();
    });

    // 디버그: 숫자 2 → 보스방 즉시 이동
    this.input.keyboard.on('keydown-TWO', () => {
      const dungeon = this.roomManager.dungeonData;
      if (!dungeon) return;
      const bossRoom = dungeon.rooms.find(r => r.type === 'boss');
      if (!bossRoom) return;
      this.roomManager._enterRoom(bossRoom, null);
    });

    // 디버그: 숫자 3 → 6층 즉시 점프 (구역 1 후반부)
    this.input.keyboard.on('keydown-THREE', () => {
      if (this.currentFloor === 6) return;
      this.currentFloor = 5;  // _advanceFloor() 가 +1 하여 6 도달
      this._advanceFloor();
    });

    // 디버그: 숫자 5 → 11층 즉시 점프 (구역 2 시작)
    this.input.keyboard.on('keydown-FIVE', () => {
      if (this.currentFloor >= 11) return;
      this.currentFloor = 10;  // _advanceFloor() 가 +1 하여 11 도달
      this._advanceFloor();
    });

    // 디버그: 숫자 7 → 21층(구역 3 시작) / 숫자 9 → 31층(구역 4 시작) — 현재 층 무관 언제든 점프
    this.input.keyboard.on('keydown-SEVEN', () => {
      this.currentFloor = 20;
      this._advanceFloor();
    });
    this.input.keyboard.on('keydown-NINE', () => {
      this.currentFloor = 30;
      this._advanceFloor();
    });

    this.events.once('player-dead', () => {
      this.input$.disable();
      this.attackManager.disable();
      this.time.delayedCall(400, () => this._showGameOver());
    });

    // 10초 주기 자동 저장 (씬 일시정지 중에는 time 클럭이 멈춰 자동으로 스킵됨)
    this._autosaveTimer = this.time.addEvent({
      delay: 10000, loop: true, callback: () => this._autosave(),
    });

    // 백그라운드 전환 시 즉시 저장 — 모바일(Android WebView) 대응.
    //   앱이 백그라운드로 가면 rAF 가 멈춰 주기 타이머가 안 돌고, OS 가 clean shutdown 없이
    //   프로세스를 죽일 수 있다. visibilitychange(hidden)/pagehide 시점에 동기 저장으로 진행분을 보존한다.
    //   localStorage.setItem 은 동기라 페이지 freeze 전에 확실히 flush 된다.
    this._onAppHide = () => { if (document.hidden) this._saveOnBackground(); };
    this._onPageHide = () => this._saveOnBackground();
    document.addEventListener('visibilitychange', this._onAppHide);
    window.addEventListener('pagehide', this._onPageHide);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', this._onAppHide);
      window.removeEventListener('pagehide', this._onPageHide);
    });

    // 복원 완료 — 이후부터 자동저장 허용
    this._restoring = false;
  }

  /** 현재 런 상태를 저장. 복원 중·엔드스크린·일시정지·사망 상태에서는 스킵. */
  _autosave() {
    if (this._restoring) return;
    if (this._endScreenEls) return;
    if (this.scene.isPaused()) return;
    if (!this.player || this.player.hp <= 0) return;
    saveRunState(this);
  }

  /** 백그라운드 전환 시 저장 — 일시정지 여부는 무시(멈춘 상태도 보존 대상). */
  _saveOnBackground() {
    if (this._restoring) return;
    if (this._endScreenEls) return;
    if (!this.player || this.player.hp <= 0) return;
    saveRunState(this);
  }

  _showGameOver() {
    this._buildRunSummary({
      title:      'GAME OVER',
      titleColor: '#ff4444',
      subtitle:   null,
      showCause:  true,
      survived:   false,
    });
  }

  /** 일시정지 메뉴 "포기" — 사망과 동일하게 보존율 정산 결과 화면을 띄운다 (UIScene 가 호출). */
  abandonRun() {
    if (this._endScreenEls) return;
    this.input$.disable();
    this.attackManager.disable();
    this._buildRunSummary({
      title:      '포기',
      titleColor: '#ffaa44',
      subtitle:   '런을 포기했다',
      showCause:  false,
      survived:   false,
    });
  }

  _showZoneClear(zone = 1) {
    this._buildRunSummary({
      title:      `ZONE ${zone} CLEAR`,
      titleColor: '#4ecca3',
      subtitle:   `구역 ${zone} 클리어!`,
      showCause:  false,
      survived:   true,
    });
  }

  /**
   * GAME OVER / ZONE CLEAR 공통 결과 요약 화면.
   * - 타이틀 + (선택) 부제
   * - 사망 위치: "구역 1 - N층"
   * - (GAME OVER) 사망 원인: 마지막 가해자 displayName
   * - 결과: 이번 런 픽업/메타 적립(사망 시 보존율·유실)/남은 코어/누적 메타
   * - 획득한 아이템 그리드 (2열)
   * - 단일 "허브로 돌아가기" 버튼
   */
  _buildRunSummary({ title, titleColor, subtitle, showCause, survived }) {
    // 런 종료(사망 / ZONE CLEAR) — 임시 저장본 삭제 (이어하기 불가)
    clearRunSave();
    this._endScreenEls = [];
    const push = (...els) => this._endScreenEls.push(...els);
    // 픽업분 정산 — 클리어=전량, 사망=보존율(Player.metaRetainRate)만 영속 적립
    const { picked, gained } = commitMetaRun(survived, this.player.metaRetainRate ?? 0.25);
    const retainRate  = survived ? 1 : (this.player.metaRetainRate ?? 0.25);
    const totalMeta   = getMetaCores(); // 정산 후 잔량
    const runCores    = this.enemyManager.coreCount;
    const cause       = this.player.lastDamageSource ?? '원인 미상';
    const inv         = this.player.inventory ?? [];

    // 풀스크린 백드롭
    push(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.82)
      .setScrollFactor(0).setDepth(100).setOrigin(0));

    // 타이틀 (+ 부제)
    let y = 76;
    push(this.add.text(GAME_W / 2, y, title, {
      fontSize: title.length > 10 ? '26px' : '34px',
      color: titleColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
    y += 30;
    if (subtitle) {
      push(this.add.text(GAME_W / 2, y, subtitle, {
        fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
      y += 22;
    }

    // 사망 위치
    const zoneN = zoneOf(this.currentFloor);
    push(this.add.text(GAME_W / 2, y, `구역 ${zoneN}  ·  ${displayFloor(this.currentFloor)}층`, {
      fontSize: '13px', color: '#cccccc', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
    y += 22;

    // 사망 원인 (GAME OVER 전용)
    if (showCause) {
      push(this.add.text(GAME_W / 2, y, `사망 원인  ·  ${cause}`, {
        fontSize: '13px', color: '#ff8888', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
      y += 22;
    }

    y += 8;
    push(this._sep(y));
    y += 14;

    // 결과 요약 — 좌측 라벨, 우측 값
    const labelX = GAME_W / 2 - 90;
    const valueX = GAME_W / 2 + 90;
    const lines = [
      { label: '이번 런 픽업', value: `◆ ${picked}`, valueColor: '#ffe9bb' },
      {
        label: survived ? '메타 적립' : `메타 적립 (보존 ${Math.round(retainRate * 100)}%)`,
        value: `+${gained}`, valueColor: '#ffcc44',
      },
    ];
    if (!survived && picked > gained) {
      lines.push({ label: '사망 유실', value: `-${picked - gained}`, valueColor: '#ff6666' });
    }
    lines.push(
      { label: '남은 런 코어', value: `◆ ${runCores}`, valueColor: '#aaaaaa' },
      { label: '누적 메타',    value: `◆ ${totalMeta}`, valueColor: '#4ecca3' },
    );
    lines.forEach(({ label, value, valueColor }) => {
      push(this.add.text(labelX, y, label, {
        fontSize: '12px', color: '#888888', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101));
      push(this.add.text(valueX, y, value, {
        fontSize: '13px', color: valueColor, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(101));
      y += 22;
    });

    y += 6;
    push(this._sep(y));
    y += 14;

    // 획득한 아이템 헤더
    push(this.add.text(GAME_W / 2, y, `획득한 아이템 (${inv.length})`, {
      fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
    y += 22;

    // 아이템 2열 그리드
    if (inv.length === 0) {
      push(this.add.text(GAME_W / 2, y, '없음', {
        fontSize: '12px', color: '#555555', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101));
      y += 22;
    } else {
      const colX  = [GAME_W / 2 - 90, GAME_W / 2 + 10];
      const rowH  = 22;
      inv.forEach((item, i) => {
        const cx  = colX[i % 2];
        const cy  = y + Math.floor(i / 2) * rowH;
        push(this.add.rectangle(cx, cy, 12, 12, item.color)
          .setScrollFactor(0).setDepth(101));
        push(this.add.text(cx + 12, cy, item.name, {
          fontSize: '12px', color: '#dddddd', fontFamily: 'monospace',
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101));
      });
      y += Math.ceil(inv.length / 2) * rowH;
    }

    // 허브로 돌아가기 버튼 (카메라 뷰포트(GAME_H - HUD_H = 756) 안 하단에 고정)
    //   ScrollFactor(0) 요소는 글로벌 0~756 안에 있어야 화면에 표시됨 — 그 외는 viewport 밖으로 잘림.
    const btnY = GAME_H - HUD_H - 60;
    const btn = this.add.rectangle(GAME_W / 2, btnY, 220, 46, 0x222222)
      .setStrokeStyle(2, 0x4ecca3).setScrollFactor(0).setDepth(101)
      .setInteractive({ cursor: 'pointer' });
    const btnTxt = this.add.text(GAME_W / 2, btnY, '허브로 돌아가기', {
      fontSize: '16px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    btn.on('pointerdown', () => {
      this.scene.stop('UIScene');
      this.scene.start('HubScene');
    });
    btn.on('pointerover', () => btn.setFillStyle(0x2a2a2a));
    btn.on('pointerout',  () => btn.setFillStyle(0x222222));
    push(btn, btnTxt);
  }

  _sep(y) {
    return this.add.rectangle(GAME_W / 2, y, GAME_W - 80, 1, 0x444444, 0.6)
      .setScrollFactor(0).setDepth(101);
  }

  _showVaultText(vaultIdx) {
    const VAULT_LINES = [
      // Vault 01 — 양지
      [
        '[ 기억 보관실 01 — 「양지(陽地)」 ]',
        '벽면이 부서지자, 따뜻한 빛이 새어 나온다.',
        '풀밭이었다. 바람에 풀이 눕고, 나는 그 사이를 달렸다.\n햇볕이 등에 닿는 감촉, 발밑에서 흙냄새가 올라오던 것까지.',
        '누군가 내 이름을 불렀다. 그 목소리를 나는 안다.\n너는 너무 빨리 달린다고, 좀 천천히 가도 된다고.',
        '따뜻했다. 그게 전부였고, 그걸로 충분했다.',
        '「기록일: 봄.  장소: 양지.  상태: 안정.」\n 「기록일: 봄.  장소: 양지.  상태: 안정.」\n「기록일: 봄.  장소: 양지.  상태: 안정.」\n\n세 줄 모두 같은 날짜다.',
      ],
      // Vault 02 — 열람
      [
        '[ 기억 보관실 02 — 「열람(閱覽)」 ]',
        '벽이 무너지자 빛 대신 차가운 모니터 광이 번진다.',
        '[ ARCANA 내부 기록 / 분류: 기밀 ]\n피험체 LAGO-7.  기억 주입 3차 완료.',
        '주입 패킷: 양지_봄_안정.eng\n— 안정성 확보를 위해 동일 단편 반복 적재.',
        '익숙한 단어다.\n양지. 봄. 안정.\n이전에 보관실에서 본 그 기억이, 여기서는 파일 이름이다.',
        '「주의: 피험체가 메타데이터 불일치를 인지할 경우,\n  위화감으로 발현될 수 있음.',
        '나는 그 풀밭을 기억한다.',
        '분명히 안다고 생각했다.',
      ],
      // Vault 03 — 원본
      [
        '[ 기억 보관실 03 — 「원본(原本)」 ]',
        '마지막 벽이 무너진다. 영상도 보고서도 아닌,\n하나의 보관 캡슐. 그 안에서 코어가 박동하고 있다.',
        '[ 코어 기록 / 분류: 원본 — 강제 열람됨 ]\n이 코어는 누군가의 것이었다.',
        '양지의 봄을, 자신을 부르던 그 목소리를\n진짜로 가졌던 — 원래의 존재.',
        'LAGO-7의 기억은 복제였다.\n원본은 코어에서 추출되어 나에게 이식됐다.\n나는 그 기억을 담을 일곱 번째 그릇이었다.',
        '「원본 상태: 소실.  잔여 기억: LAGO-7에 귀속.」\n\n그 목소리는 내 것이 아니었다.\n하지만 나는 여전히 그것이 따뜻했다고 기억한다.',
      ],
      // Vault 04 — 잔향
      [
        '[ 기억 보관실 04 — 「잔향(殘響)」 ]',
        '벽 너머는 텅 빈 정비실이다.\n해체된 사냥꾼 하나가 받침대 위에 누워 있다.',
        '[ 정비 로그 / 분류: 구조체 ARC-H ]\n외피 아래로 합금 골격과 식은 회로가 드러난다.',
        '내가 쫓던 것은 살아있지 않았다.\n분노를 쏟을 피도, 멈출 심장도 없는 — 기계.',
        '그렇다면 나는 무엇에 복수하고 있었나.\n양지도, 봄도, 그 목소리도.\n누가 나에게 그것을 쥐여주고, 쫓게 만들었나.',
        '「구조체 가동 로그: LAGO-7 추적 지속.  목표: 구역 4.」',
      ],
    ];

    const lines = VAULT_LINES[vaultIdx] ?? VAULT_LINES[0];
    const ui = this.scene.get('UIScene');
    if (ui?.openDialogue) {
      this.player.halt?.();
      // 이미 본 보관실 대사면 '건너뛰기' 노출. 본 직후 영속 기록.
      const key = `vault_${vaultIdx}`;
      ui.openDialogue(lines, null, hasSeenDialogue(key), '???');
      markDialogueSeen(key);
      return;
    }

    // UIScene 다이얼로그 미지원 시 폴백: 인게임 단일 페이지 팝업
    const depth = 110;
    const bg = this.add.rectangle(GAME_W / 2, ROOM_H / 2, GAME_W - 40, ROOM_H - 120, 0x080820, 0.92)
      .setScrollFactor(0).setDepth(depth).setStrokeStyle(1, 0x7733cc, 0.8);
    const title = this.add.text(GAME_W / 2, 100, lines[0], {
      fontSize: '12px', color: '#aa66ff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(depth + 1);
    const body = this.add.text(GAME_W / 2, 140, lines.slice(1).join('\n\n'), {
      fontSize: '11px', color: '#ccbbee', fontFamily: 'monospace',
      wordWrap: { width: GAME_W - 80 }, align: 'left',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(depth + 1);
    const hint = this.add.text(GAME_W / 2, ROOM_H - 80, '[ 탭하여 닫기 ]', {
      fontSize: '11px', color: '#666688', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1);

    const els = [bg, title, body, hint];
    const close = () => els.forEach(e => { if (e.active) e.destroy(); });
    this.input.once('pointerdown', close);
  }

  _spawnStartRoomItem() {
    const owned = new Set(this._ownedItemIds());
    const pool  = PassiveItem.getUnlocked().filter(id => !owned.has(id));
    // 기본 1개 + '기억 단편화' 해금(extraStartItems) + '누군가의 기억' 깊은 층 시작 보너스(_memoryStartBonus).
    // 실제 개수는 미보유 해금 아이템 수(pool)가 상한 — 풀이 모자라면 거기서 잘린다.
    const desired   = 1 + (this.player.extraStartItems ?? 0) + (this._memoryStartBonus ?? 0);
    const count     = Math.min(pool.length, desired);
    const positions = this._startItemPositions(count);
    // Fisher-Yates 부분 셔플 — 중복 없이 count 개 선택
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      const pos = positions[i] ?? positions[0] ?? { x: ROOM_W / 2, y: ROOM_H / 2 };
      this._passiveItems.push(this._makePassiveItem(pos.x, pos.y, pool[i]));
    }
  }

  /**
   * 시작 방 아이템 배치 좌표 — 플레이어 스폰(방 중앙) 위쪽에 격자로 배치(행별 가운데 정렬).
   * 스폰 지점과 겹치지 않게 충분히 띄워, 시작 즉시 자동 획득되지 않고 라벨을 보고 다가가 줍게 한다.
   * (바닥 행이 가장 아래, 위로 쌓임.)
   */
  _startItemPositions(count) {
    const cx = ROOM_W / 2;
    const cols = 4, gap = 70;
    // 바닥 행을 플레이어 스폰(ROOM_H/2)보다 위로 — 자동 획득 반경(30px)·라벨 반경(80px) 밖.
    const bottomY = ROOM_H / 2 - 96;
    const n   = Math.max(1, count);
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const rowCount = Math.min(cols, n - r * cols); // 이 행의 아이템 수 (가운데 정렬용)
      out.push({
        x: cx + (c - (rowCount - 1) / 2) * gap,
        y: bottomY - r * gap, // 위로 쌓이게
      });
    }
    return out;
  }

  _makePassiveItem(x, y, id) {
    const item = new PassiveItem(this, x, y, id);
    item.roomId = this.roomManager.currentRoomData?.id ?? null;
    return item;
  }

  /** 현재 보유한 패시브 id 목록 — 상점 슬롯·보스 드롭 제외 필터에 사용 */
  _ownedItemIds() {
    return (this.player?.inventory ?? []).map(i => i.id).filter(Boolean);
  }

  /**
   * 패시브 아이템 1개 드롭 (보스 클리어·엘리트 처치 공용).
   * 미보유 일반 패시브 + 스택형(코어 결정체) 중 랜덤 1개. 코어 결정체는 보유 여부와 무관하게 항상 후보라
   * 평소에도 섞여 나오고, 일반 패시브가 전부 소진되면 자연히 코어 결정체만 남아 확정 드롭된다.
   */
  _dropPassiveItem(x, y) {
    const excluded = new Set([
      ...this._ownedItemIds(),
      ...this._passiveItems.filter(i => i.alive).map(i => i.id),
    ]);
    const dropable = Object.keys(ITEM_DEFS)
      .filter(id => !excluded.has(id) || ITEM_DEFS[id].stackable);
    const id   = dropable[Math.floor(Math.random() * dropable.length)] ?? 'core_crystal';
    const safe = this.roomManager?.findSafeDropPos(x, y) ?? { x, y };
    this._passiveItems.push(this._makePassiveItem(safe.x, safe.y, id));
  }

  _advanceFloor() {
    // 최종 층 이후로는 계단 트리거 자체가 발생하지 않지만 방어용 가드
    if (this.currentFloor >= MAX_FLOOR) return;
    this._disposeStairs();
    this._stairsRoomId    = null;
    this._stairsPos       = null;
    this._altarSlots      = null;
    this._stairsTriggered = false;
    this.currentFloor++;
    const cam = this.cameras.main;
    cam.fadeOut(500, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      this._passiveItems.forEach(i => { if (i.alive) i.dispose(); });
      this._passiveItems = [];
      if (this._shopkeeper) { this._shopkeeper.dispose(); this._shopkeeper = null; }
      this.enemyManager.clearAll();
      this.roomManager.setFloor(this.currentFloor);
      this.roomManager.init(generateDungeon(
        this.currentFloor, undefined, this._ownedItemIds(),
        this.player.shopSlotBonus ?? 0,
        (this.player.shopPriceMult ?? 1) * zonePriceMult(this.currentFloor),
      ));
      this.events.emit('floor-changed', this.currentFloor);
      cam.fadeIn(500, 0, 0, 0);
      cam.once('camerafadeincomplete', () => this._showFloorBanner(this.currentFloor));
    });
  }

  /** 특정 방의 (x,y)에 계단 위치를 등록 — 현재 방이면 즉시 표시 */
  _markStairs(roomId, x, y) {
    this._stairsRoomId = roomId;
    this._stairsPos    = { x, y };
    if (this.roomManager.currentRoomData?.id === roomId) {
      this._spawnStairs(x, y);
    }
  }

  _spawnStairs(x, y) {
    if (this._stairs) return;
    const rect = this.add.rectangle(x, y, 44, 44, 0x1a1a3a)
      .setStrokeStyle(2, 0x4ecca3).setDepth(8);
    const text = this.add.text(x, y, '▼', {
      fontSize: '26px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9);
    const pulse = this.tweens.add({
      targets: [rect, text], scaleX: 1.15, scaleY: 1.15,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    // 근접 시 표시되는 입력 프롬프트 (A 버튼 / Z 키)
    const prompt = this.add.text(x, y + 36, '▼ A 키 / 탭 — 다음 층', {
      fontSize: '12px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9).setVisible(false);
    const promptBlink = this.tweens.add({
      targets: prompt, alpha: 0.55,
      duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    this._stairs = { rect, text, pulse, prompt, promptBlink };
    this._stairsNear = false;
  }

  _disposeStairs() {
    if (!this._stairs) return;
    this._stairs.pulse?.remove();
    this._stairs.promptBlink?.remove();
    if (this._stairs.rect.active)   this._stairs.rect.destroy();
    if (this._stairs.text.active)   this._stairs.text.destroy();
    if (this._stairs.prompt?.active) this._stairs.prompt.destroy();
    this._stairs = null;
    this._stairsNear = false;
  }

  /** 구역 경계 통과 안내 — 5층 보스 처치 후 계단 등장 시점에 잠깐 표시 */
  _showZoneTransition(nextZone) {
    const clearedZone = nextZone - 1;
    const txt = this.add.text(ROOM_W / 2, ROOM_H / 2 - 60, `ZONE ${clearedZone} CLEAR`, {
      fontSize: '22px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(90).setAlpha(0);
    this.tweens.add({
      targets: txt, alpha: 1, duration: 350, ease: 'Quad.Out',
      onComplete: () => {
        this.time.delayedCall(1400, () => {
          this.tweens.add({
            targets: txt, alpha: 0, duration: 400, ease: 'Quad.In',
            onComplete: () => { if (txt.active) txt.destroy(); },
          });
        });
      },
    });
  }

  /** 서사용 일시 표시 배너 (구역 3 보스 처치 "공허함" 등) — 비차단, 잠깐 떴다 사라짐 */
  _showStoryBanner(msg) {
    const txt = this.add.text(ROOM_W / 2, ROOM_H / 2 - 40, msg, {
      fontSize: '15px', color: '#cfd8dc', fontFamily: 'monospace', fontStyle: 'italic',
      stroke: '#000000', strokeThickness: 3, align: 'center', wordWrap: { width: ROOM_W - 60 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91).setAlpha(0);
    this.tweens.add({
      targets: txt, alpha: 1, duration: 500, ease: 'Quad.Out',
      onComplete: () => {
        this.time.delayedCall(2600, () => {
          this.tweens.add({
            targets: txt, alpha: 0, duration: 600, ease: 'Quad.In',
            onComplete: () => { if (txt.active) txt.destroy(); },
          });
        });
      },
    });
  }

  /** 최종 보스(구역 4) 처치 — 사냥꾼의 정체를 자각하는 대화창 후 런 종료 */
  _showHunterTruth(zone = MAX_ZONE) {
    this.player.halt?.();
    const ui = this.scene.get('UIScene');
    ui.openDialogue?.(ZONE4_BOSS_CLEAR_LINES, () => this._showZoneClear(zone), false, 'PLAYER');
  }

  _showFloorBanner(floor) {
    const txt = this.add.text(ROOM_W / 2, ROOM_H / 2, `FLOOR ${displayFloor(floor)}`, {
      fontSize: '36px', color: '#4ecca3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(90).setAlpha(0);
    this.tweens.add({
      targets: txt, alpha: 1, duration: 400, ease: 'Quad.Out',
      onComplete: () => {
        this.time.delayedCall(1000, () => {
          this.tweens.add({
            targets: txt, alpha: 0, duration: 400, ease: 'Quad.In',
            onComplete: () => { if (txt.active) txt.destroy(); },
          });
        });
      },
    });
  }

  update(_time, delta) {
    // 결과 화면(사망/클리어/포기)이 떠 있으면 게임플레이 갱신 정지 — 포기 후 잔여 적 접촉으로
    // player-dead 가 추가로 발생해 결과창이 중복 생성되는 것을 막는다.
    if (this._endScreenEls) return;

    this.player.update(this.input$.getDirection(), delta);
    this.attackManager.update(delta);
    this.enemyManager.update(delta);
    this.roomManager.update();
    if (this._shopkeeper) this._shopkeeper.update(this.player);
    if (this._altar) this._altar.update(this.player);
    if (this._memoryTape) this._memoryTape.update(this.player);
    if (this._graveGrim) this._graveGrim.update(this.player);

    const _curRoomId = this.roomManager.currentRoomData?.id;
    for (const item of this._passiveItems) {
      if (!item.alive) continue;
      if (item.roomId != null && item.roomId !== _curRoomId) continue;
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, item.x, item.y,
      );
      // 픽업 전 근접 시 아이템 이름 표시 (수집 반경보다 넓은 범위)
      item.setLabelVisible(d < 80);
      if (d < 30) {
        const wasMapReveal = this.player.hasMapReveal;
        item.collect(this.player);
        if (!wasMapReveal && this.player.hasMapReveal) {
          const ui = this.scene.get('UIScene');
          ui._refreshMinimap?.(this.roomManager.dungeonData, this.roomManager.currentRoomData.id);
        }
      }
    }

    // 계단 근접 프롬프트 — 자동 트리거는 제거됨. A 버튼 / Z 키 / A 슬롯 탭 입력으로만 이동.
    if (this._stairs && !this._stairsTriggered) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this._stairs.rect.x, this._stairs.rect.y,
      );
      const near = d < 50;
      if (near !== this._stairsNear) {
        this._stairsNear = near;
        if (this._stairs.prompt?.active) this._stairs.prompt.setVisible(near);
      }
    }
  }

  /** AttackManager 가 A 버튼 입력 시 우선 호출. 계단 근접이면 다음 층 전환을 트리거하고 true 반환. */
  _tryEnterStairs() {
    if (!this._stairs || this._stairsTriggered || !this._stairsNear) return false;
    this._stairsTriggered = true;
    this._advanceFloor();
    return true;
  }
}
