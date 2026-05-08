const GRID_COLS = 8;
const GRID_ROWS = 6;

const DIRS = [
  { dc:  0, dr: -1, dir: 'up',    opp: 'down'  },
  { dc:  0, dr:  1, dir: 'down',  opp: 'up'    },
  { dc: -1, dr:  0, dir: 'left',  opp: 'right' },
  { dc:  1, dr:  0, dir: 'right', opp: 'left'  },
];

/**
 * 랜덤 워크로 9~12개 방을 배치하고 인접 연결.
 * Phaser 의존 없는 순수 데이터 함수.
 */
export function generateDungeon(targetCount) {
  targetCount ??= 9 + Math.floor(Math.random() * 4); // 9-12

  const grid  = new Map(); // "col,row" → roomData
  const rooms = [];

  const key    = (c, r) => `${c},${r}`;
  const inGrid = (c, r) => c >= 0 && c < GRID_COLS && r >= 0 && r < GRID_ROWS;

  const addRoom = (col, row, type = 'combat') => {
    const k = key(col, row);
    if (grid.has(k)) return null;
    const data = {
      id:      rooms.length,
      col, row, type,
      doors:   { up: null, down: null, left: null, right: null },
      cleared: type === 'start',
      visited: false,
    };
    grid.set(k, data);
    rooms.push(data);
    return data;
  };

  // 시작방: 격자 중앙
  const sc = Math.floor(GRID_COLS / 2);
  const sr = Math.floor(GRID_ROWS / 2);
  addRoom(sc, sr, 'start');

  let col = sc, row = sr;

  while (rooms.length < targetCount) {
    const free = DIRS.filter(d => inGrid(col + d.dc, row + d.dr) && !grid.has(key(col + d.dc, row + d.dr)));

    if (free.length === 0) {
      // 막다른 곳 → 빈 이웃이 있는 기존 방으로 이동
      const candidates = rooms.filter(r =>
        DIRS.some(d => inGrid(r.col + d.dc, r.row + d.dr) && !grid.has(key(r.col + d.dc, r.row + d.dr)))
      );
      if (!candidates.length) break;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      col = pick.col; row = pick.row;
      continue;
    }

    const d = free[Math.floor(Math.random() * free.length)];
    col += d.dc;
    row += d.dr;
    addRoom(col, row);
  }

  // 인접한 방끼리 문 연결
  rooms.forEach(room => {
    DIRS.forEach(({ dc, dr, dir }) => {
      const nb = grid.get(key(room.col + dc, room.row + dr));
      if (nb) room.doors[dir] = nb.id;
    });
  });

  return { rooms, startId: 0, grid, gridCols: GRID_COLS, gridRows: GRID_ROWS };
}
