'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const COLS = ['A', 'B', 'C', 'D', 'E'];
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ASSETS = 'blue-prince-room-index-export';

const LS_KEY = 'bp-layers';

const GROUP_COLORS = {
  blue:   '#6bb3e8',
  green:  '#7ec87f',
  red:    '#e87777',
  yellow: '#e8d87a',
  purple: '#c77ee8',
  orange: '#e8a86b',
  cyan:   '#6be8d8',
  white:  '#e0e0e0',
  gray:   '#aaaaaa',
  outer:  '#9ab8a0',
  black:  '#888888',
};

const ELEMENTS = [
  'H','He','Li','Be','B','C','N','O','F','Ne',
  'Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca',
  'Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn',
  'Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr',
  'Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn',
  'Sb','Te','I','Xe','Cs','Ba','La','Ce','Pr','Nd',
  'Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb',
  'Lu','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg',
  'Tl','Pb','Bi','Po','At','Rn','Fr','Ra','Ac','Th',
  'Pa','U','Np','Pu','Am','Cm','Bk','Cf','Es','Fm',
  'Md','No','Lr','Rf','Db','Sg','Bh','Hs','Mt','Ds',
];

// Layer metadata (index 0 = Layer 1 in UI)
const LAYER_META = [
  { name: 'Room Tiles', type: 'tiles'   },
  { name: 'PATH',       type: 'path'    },
  { name: 'Room Color', type: 'color'   },
  { name: 'Room #',     type: 'number'  },
  { name: 'Element',    type: 'element' },
  { name: 'Custom 1',   type: 'custom'  },
  { name: 'Custom 2',   type: 'custom'  },
  { name: 'Custom 3',   type: 'custom'  },
  { name: 'Custom 4',   type: 'custom'  },
  { name: 'Custom 5',   type: 'custom'  },
  { name: 'Custom 6',   type: 'custom'  },
];

// PATH code → { iconId, baseRotation }
const PATH_ICON_MAP = {
  '1':  { iconId: 111, baseRot: 0   },
  '2L': { iconId: 112, baseRot: 90  }, // mirrored from original
  '2R': { iconId: 112, baseRot: 0   }, // mirrored from original
  '2S': { iconId: 113, baseRot: 0   },
  '3L': { iconId: 114, baseRot: 180 }, // +180° from original
  '3R': { iconId: 114, baseRot: 270 }, // +180° from original
  '3T': { iconId: 114, baseRot: 90  }, // +180° from original
  '4':  { iconId: 115, baseRot: 0   },
};

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  rooms: [],
  // cellId -> { roomId: number, rotation: 0|90|180|270 }
  map: {},
  selected: null,   // cellId or null
  drag: null,       // { source: 'menu'|'cell', roomId: number, fromCell?: string }
  activeLayer: 0,   // 0-indexed layer
  layerData: null,  // shared bp-layers object
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const byId    = id  => document.getElementById(id);
const cellEl  = cid => document.querySelector(`.map-cell[data-cell="${cid}"]`);
const room    = id  => state.rooms.find(r => r.id === id);

function fmtGroup(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function groupColor(colorKey) {
  return GROUP_COLORS[colorKey] ?? '#cccccc';
}

function colorSwatchBackground(colorKey) {
  if (!colorKey || colorKey === 'rainbow') {
    return 'linear-gradient(to right,#e87777,#e8a86b,#e8d87a,#7ec87f,#6bb3e8,#c77ee8)';
  }
  const parts = colorKey.split('/');
  if (parts.length === 1) return GROUP_COLORS[colorKey] ?? '#aaa';
  const colors = parts.map(p => GROUP_COLORS[p] ?? '#aaa');
  const pct = 100 / colors.length;
  const stops = colors.flatMap((c, i) => [`${c} ${i*pct}%`, `${c} ${(i+1)*pct}%`]).join(',');
  return `linear-gradient(135deg,${stops})`;
}

function allCellIds() {
  return ['grounds', ...ROWS.flatMap(r => COLS.map(c => `${c}${r}`))];
}

// Default Room Color layer — must stay in sync with layers/app.js
const COLOR_DEFAULT = 'blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;rainbow;blue;blue;purple;purple;purple;purple;purple;purple;purple;purple;orange;orange;orange;orange;orange;orange;orange;orange;green;green;green;green;green;green;green;green;yellow;yellow;yellow;yellow;yellow;yellow;black/yellow;yellow;red;red;purple/red;red;red;red;red;red;blue;blue;blue;blue;green;purple;orange;yellow;blue;blue;black;blue/black;orange;green;red;red;blue;blue;blue;blue;green;purple;yellow;black'.split(';');

// ── Layer data ────────────────────────────────────────────────────────────────

function loadLayerData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function saveLayerData() {
  localStorage.setItem(LS_KEY, JSON.stringify(state.layerData));
}

// Default PATH layer — one entry per room (1-110), committed 2026-04-18
const PATH_DEFAULT = '3T;4;2S;4;2L;2L;2S;2L;1;1;1;1;2L;2L;2L;2S;3T;1;2L;2S;2L;2S;1;2L;3T;1;2L;4;3T;2S;1;3T;2L;3T;2S;2L;1;1;1;1;3T;2L;3T;3T;4;1;2L;2L;1;1;1;1;1;1;3T;3T;3T;2S;4;2S;2S;4;1;2L;3T;4;2S;2L;2L;3T;2L;2L;1;2S;1;2L;2L;3T;1;3T;2L;4;3T;3T;4;1;2L;2S;1;2L;1;1;4;2L;1;4;2L;3T;2S;2L;2L;3T;1;1;1;1;1;1;1;1'.split(';');

function initLayerData() {
  const existing = loadLayerData();

  const defaults = {
    active:  0,
    locked:  [true, true, true, true, true, false, false, false, false, false, false],
    path:    [...PATH_DEFAULT],
    colors:  [...COLOR_DEFAULT],
    element: [...ELEMENTS],
    custom: [
      { name: 'Custom 1', values: new Array(110).fill('') },
      { name: 'Custom 2', values: new Array(110).fill('') },
      { name: 'Custom 3', values: new Array(110).fill('') },
      { name: 'Custom 4', values: new Array(110).fill('') },
      { name: 'Custom 5', values: new Array(110).fill('') },
      { name: 'Custom 6', values: new Array(110).fill('') },
    ],
  };

  if (!existing) {
    state.layerData = defaults;
    saveLayerData();
    return;
  }

  state.layerData = existing;
  if (!Array.isArray(state.layerData.locked) || state.layerData.locked.length !== 11) {
    state.layerData.locked = defaults.locked;
  }
  if (!Array.isArray(state.layerData.path) || state.layerData.path.length !== 110) {
    state.layerData.path = defaults.path;
  }
  if (!Array.isArray(state.layerData.colors) || state.layerData.colors.length !== 110) {
    state.layerData.colors = defaults.colors;
  }
  if (!Array.isArray(state.layerData.element) || state.layerData.element.length !== 110) {
    state.layerData.element = defaults.element;
  }
  if (!Array.isArray(state.layerData.custom) || state.layerData.custom.length !== 6) {
    state.layerData.custom = defaults.custom;
  } else {
    state.layerData.custom.forEach((c, i) => {
      if (!c.name) c.name = defaults.custom[i].name;
      if (!Array.isArray(c.values) || c.values.length !== 110) {
        c.values = new Array(110).fill('');
      }
    });
  }
  if (typeof state.layerData.active !== 'number') state.layerData.active = 0;
  state.activeLayer = state.layerData.active;
}

function getLayerValue(roomId, layerIdx) {
  if (!state.layerData || roomId < 1 || roomId > 110) return '';
  if (layerIdx === 1) return state.layerData.path[roomId - 1] || '';
  if (layerIdx === 4) return state.layerData.element[roomId - 1] || '';
  if (layerIdx >= 5) return (state.layerData.custom[layerIdx - 5]?.values[roomId - 1]) || '';
  return '';
}

function getLayerDisplayName(li) {
  if (!state.layerData) return LAYER_META[li].name;
  if (li >= 5) return state.layerData.custom[li - 5]?.name || LAYER_META[li].name;
  return LAYER_META[li].name;
}

// ── Layer Navigator ───────────────────────────────────────────────────────────

function updateLayerNav() {
  const li    = state.activeLayer;
  const meta  = LAYER_META[li];
  const name  = getLayerDisplayName(li);
  const locked = state.layerData?.locked[li] ?? true;

  byId('layer-label').textContent = `Layer ${li + 1}: ${name}`;
  byId('layer-lock-icon').textContent = locked ? '🔒' : '🔓';
  byId('layer-lock-icon').title = locked ? 'Layer is locked' : 'Layer is unlocked';
}

function setActiveLayer(li) {
  state.activeLayer = li;
  if (state.layerData) {
    state.layerData.active = li;
    saveLayerData();
  }
  updateLayerNav();
  allCellIds().forEach(renderCell);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  let data;
  try {
    const res = await fetch(`${ASSETS}/rooms.json?v=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    alert(
      'Could not load room data.\n\n' +
      'Make sure you are serving the app from a local HTTP server:\n\n' +
      '  python3 -m http.server 8080\n\n' +
      'Then open http://localhost:8080'
    );
    console.error(e);
    return;
  }

  state.rooms = data.rooms;
  initLayerData();
  state.activeLayer = state.layerData.active ?? 0;

  buildLibrary();
  buildMap();
  setDefaults();
  bindGlobalEvents();
  clearInfo();
  updateLayerNav();
}

// ── Defaults ─────────────────────────────────────────────────────────────────

function setDefaults() {
  const entranceHall = state.rooms.find(r => r.slug === 'entrance-hall');
  const antechamber  = state.rooms.find(r => r.slug === 'antechamber');
  if (entranceHall) place(entranceHall.id, 'C1', 0, true);
  if (antechamber)  place(antechamber.id,  'C9', 0, true);
  state.selected = null;
  clearInfo();
}

// ── Library (left panel) ──────────────────────────────────────────────────────

function buildLibrary() {
  const library = byId('room-library');

  // Group rooms preserving order
  const groupMap = new Map();
  state.rooms.forEach(r => {
    if (!groupMap.has(r.group)) groupMap.set(r.group, []);
    groupMap.get(r.group).push(r);
  });

  for (const [groupName, rooms] of groupMap) {
    const color = groupColor(rooms[0].groupColor);

    const groupDiv = document.createElement('div');
    groupDiv.className = 'room-group';

    const hdr = document.createElement('div');
    hdr.className = 'group-header';
    hdr.textContent = fmtGroup(groupName);
    hdr.style.color = color;
    hdr.style.borderLeftColor = color;
    groupDiv.appendChild(hdr);

    const tilesDiv = document.createElement('div');
    tilesDiv.className = 'group-tiles';

    rooms.forEach(r => tilesDiv.appendChild(makeMenuTile(r)));

    groupDiv.appendChild(tilesDiv);
    library.appendChild(groupDiv);
  }

  // Left panel: drop zone to discard map tiles
  const panel = byId('left-panel');
  panel.addEventListener('dragover', e => {
    if (state.drag?.source === 'cell') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });
  panel.addEventListener('drop', e => {
    e.preventDefault();
    if (state.drag?.source === 'cell' && state.drag.fromCell) {
      removeFromMap(state.drag.fromCell);
    }
    state.drag = null;
  });
}

function makeMenuTile(r) {
  const tile = document.createElement('div');
  tile.className = 'menu-tile';
  tile.draggable = true;
  tile.title = r.title;

  const img = document.createElement('img');
  img.src = `${ASSETS}/${r.icon}`;
  img.alt = r.title;
  img.draggable = false;
  tile.appendChild(img);

  const lbl = document.createElement('div');
  lbl.className = 'menu-tile-label';
  lbl.textContent = `${r.title} (${r.id})`;
  tile.appendChild(lbl);

  tile.addEventListener('dragstart', e => {
    state.drag = { source: 'menu', roomId: r.id };
    e.dataTransfer.effectAllowed = 'copy';
    tile.classList.add('dragging');
  });
  tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
  tile.addEventListener('click', () => showInfo(r.id));

  return tile;
}

// ── Map ───────────────────────────────────────────────────────────────────────

// CSS Grid layout (1-indexed):
//   Cols: 1=grounds  2=gap(empty)  3=row-labels  4-8=A-E
//   Rows: 1=top-hdr  2-10=map rows 9→1  11=bot-hdr
function buildMap() {
  const section = byId('map-section');

  // Top column headers (A-E), row 1
  COLS.forEach((col, i) => {
    section.appendChild(gridEl('col-header', 4 + i, 1, col));
  });

  // Map rows: row 9 at grid-row 2 (top), row 1 at grid-row 10 (bottom)
  [...ROWS].reverse().forEach((row, idx) => {
    const gridRow = 2 + idx;

    section.appendChild(gridEl('row-label', 3, gridRow, row));

    COLS.forEach((col, i) => {
      const cell = makeMapCell(`${col}${row}`);
      cell.style.gridColumn = 4 + i;
      cell.style.gridRow = gridRow;
      section.appendChild(cell);
    });

    // Grounds cell sits beside row 1 (grid-row 10)
    if (row === 1) {
      const grounds = makeMapCell('grounds');
      grounds.style.gridColumn = 1;
      grounds.style.gridRow = gridRow;
      section.appendChild(grounds);
    }
  });

  // Bottom column headers (A-E), row 11
  COLS.forEach((col, i) => {
    section.appendChild(gridEl('col-header', 4 + i, 11, col));
  });

  // Grounds label, col 1, row 11
  section.appendChild(gridEl('grounds-label', 1, 11, 'Grounds'));
}

function gridEl(cls, col, row, text) {
  const e = document.createElement('div');
  e.className = cls;
  e.style.gridColumn = col;
  e.style.gridRow = row;
  if (text !== undefined) e.textContent = text;
  return e;
}

function makeMapCell(cid) {
  const cell = document.createElement('div');
  cell.className = 'map-cell';
  cell.dataset.cell = cid;
  wireCellEvents(cell, cid);
  return cell;
}

function wireCellEvents(cell, cid) {
  cell.addEventListener('dragover', e => {
    if (state.drag) {
      e.preventDefault();
      e.dataTransfer.dropEffect = state.drag.source === 'menu' ? 'copy' : 'move';
      cell.classList.add('drag-over');
    }
  });
  cell.addEventListener('dragleave', e => {
    // Only remove drag-over when leaving the cell entirely (not entering a child)
    if (!cell.contains(e.relatedTarget)) {
      cell.classList.remove('drag-over');
    }
  });
  cell.addEventListener('drop', e => {
    e.preventDefault();
    cell.classList.remove('drag-over');
    if (!state.drag) return;

    if (state.drag.source === 'menu') {
      place(state.drag.roomId, cid, 0);
    } else if (state.drag.source === 'cell') {
      const from = state.drag.fromCell;
      if (from && from !== cid) {
        const existing = state.map[from];
        if (existing) {
          place(existing.roomId, cid, existing.rotation);
          removeFromMap(from);
        }
      }
    }
    state.drag = null;
  });

  cell.addEventListener('click', e => {
    // Only select if clicking the cell background, not the tile handle drag
    if (e.target === cell || e.target.classList.contains('placed-tile')) {
      selectCell(cid);
    }
  });
}

// ── Map State ─────────────────────────────────────────────────────────────────

function place(roomId, cid, rotation, noSelect = false) {
  state.map[cid] = { roomId, rotation };
  renderCell(cid);
  if (!noSelect) selectCell(cid);
}

function removeFromMap(cid) {
  delete state.map[cid];
  renderCell(cid);
  if (state.selected === cid) {
    state.selected = null;
    cellEl(cid)?.classList.remove('selected');
    clearInfo();
  }
}

function renderCell(cid) {
  const cell = cellEl(cid);
  if (!cell) return;

  // Remove existing placed tile
  cell.querySelector('.placed-tile')?.remove();

  const entry = state.map[cid];
  if (!entry) return;

  const r = room(entry.roomId);
  if (!r) return;

  const tile = document.createElement('div');
  tile.className = 'placed-tile';
  tile.draggable = true;
  tile.title = r.title;

  const li = state.activeLayer;
  const meta = LAYER_META[li];

  if (meta.type === 'tiles') {
    // Layer 1: room tile with rotation
    renderTileLayer(tile, r, entry.rotation);

  } else if (meta.type === 'path') {
    // Layer 2: path icon with rotation (or dim+unknown marker)
    renderPathLayer(tile, r, entry.rotation);

  } else if (meta.type === 'color') {
    // Layer 3: room tile + color overlay (no rotation effect on overlay)
    renderTileLayer(tile, r, entry.rotation);
    renderColorOverlay(tile, r);

  } else if (meta.type === 'number') {
    // Layer 4: room tile + room number bubble
    renderTileLayer(tile, r, entry.rotation);
    renderBubble(tile, String(r.id));

  } else if (meta.type === 'element') {
    // Layer 5: room tile + element bubble
    renderTileLayer(tile, r, entry.rotation);
    const val = getLayerValue(r.id, li);
    if (val) renderBubble(tile, val);

  } else {
    // Layers 6-8 (custom): room tile + custom text bubble
    renderTileLayer(tile, r, entry.rotation);
    const val = getLayerValue(r.id, li);
    if (val) renderBubble(tile, val);
  }

  // Drag handlers
  tile.addEventListener('dragstart', e => {
    e.stopPropagation();
    state.drag = { source: 'cell', roomId: entry.roomId, fromCell: cid };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => tile.classList.add('dragging'), 0);
  });
  tile.addEventListener('dragend', () => {
    tile.classList.remove('dragging');
    state.drag = null;
  });
  tile.addEventListener('click', e => {
    e.stopPropagation();
    selectCell(cid);
  });

  // Rotation buttons — only on Layer 1 (tiles) and Layer 2 (path) — visible only when selected
  if (meta.type === 'tiles' || meta.type === 'path') {
    tile.appendChild(makeRotateBtn('↺', 'rotate-btn-left',  'Rotate left (Q)',  () => {
      entry.rotation = (entry.rotation - 90 + 360) % 360;
      renderCell(cid);
    }));
    tile.appendChild(makeRotateBtn('↻', 'rotate-btn-right', 'Rotate right (E)', () => {
      entry.rotation = (entry.rotation + 90) % 360;
      renderCell(cid);
    }));
  }

  cell.appendChild(tile);
  cell.classList.toggle('selected', state.selected === cid);
}

function renderTileLayer(tile, r, rotation) {
  const img = document.createElement('img');
  img.src = `${ASSETS}/${r.icon}`;
  img.alt = r.title;
  img.draggable = false;
  img.style.transform = `rotate(${rotation}deg)`;
  tile.appendChild(img);
}

function renderPathLayer(tile, r, cellRotation) {
  const val = getLayerValue(r.id, 1);
  const pathInfo = val ? PATH_ICON_MAP[val] : null;

  if (!pathInfo) {
    // No path data: dim the room tile and show "?"
    tile.classList.add('layer-dim');
    renderTileLayer(tile, r, cellRotation);
    const unk = document.createElement('div');
    unk.className = 'layer-unknown';
    unk.textContent = '?';
    tile.appendChild(unk);
    return;
  }

  const pathRoom = room(pathInfo.iconId);
  if (!pathRoom) {
    renderTileLayer(tile, r, cellRotation);
    return;
  }

  const totalRot = (pathInfo.baseRot + cellRotation) % 360;
  const img = document.createElement('img');
  img.src = `${ASSETS}/${pathRoom.icon}`;
  img.alt = val;
  img.draggable = false;
  img.style.transform = `rotate(${totalRot}deg)`;
  tile.appendChild(img);
}

function renderColorOverlay(tile, r) {
  const colorKey = state.layerData?.colors?.[r.id - 1] || r.groupColor;
  const overlay = document.createElement('div');
  overlay.className = 'layer-color-overlay';
  overlay.style.background = colorSwatchBackground(colorKey);
  overlay.style.opacity = '0.75';
  tile.appendChild(overlay);
}

function renderBubble(tile, text) {
  const bubble = document.createElement('div');
  bubble.className = 'layer-bubble';
  bubble.textContent = text;
  // Scale font slightly for 3+ char text to keep it within the circle
  if (text.length >= 3) bubble.style.fontSize = '9px';
  tile.appendChild(bubble);
}

function makeRotateBtn(symbol, cls, title, onClick) {
  const btn = document.createElement('div');
  btn.className = `rotate-btn ${cls}`;
  btn.textContent = symbol;
  btn.title = title;
  btn.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  btn.addEventListener('mousedown', e => e.stopPropagation()); // don't trigger drag
  return btn;
}

function selectCell(cid) {
  const prev = state.selected;
  state.selected = cid;

  if (prev && prev !== cid) cellEl(prev)?.classList.remove('selected');
  if (cid) cellEl(cid)?.classList.add('selected');

  const entry = state.map[cid];
  if (entry) showInfo(entry.roomId);
  else clearInfo();
}

// ── Room Info Panel ───────────────────────────────────────────────────────────

function showInfo(roomId) {
  const r = room(roomId);
  if (!r) return;

  const color = groupColor(r.groupColor);

  const tags = [
    ...(r.typeTags || []).map(t => `<span class="tag">${esc(t)}</span>`),
    r.cost ? `<span class="tag tag-cost">${esc(r.cost)}</span>` : '',
  ].join('');

  byId('room-info').innerHTML = `
    <img class="info-tile-img" src="${ASSETS}/${r.icon}" alt="${esc(r.title)}">
    <div class="info-title" style="color:${color}">${esc(r.title)} <span class="info-id">(${r.id})</span></div>
    <div class="info-tags">${tags}</div>
    <div class="info-group" style="color:${color}">${esc(fmtGroup(r.group))}</div>
    ${r.directoryBlurb
      ? `<div class="info-blurb">${esc(r.directoryBlurb)}</div>`
      : ''}
    ${r.description
      ? `<div class="info-description"><strong>Mechanics:</strong> ${esc(r.description)}</div>`
      : ''}
    ${r.unlock
      ? `<div class="info-unlock"><strong>Unlock:</strong> ${esc(r.unlock)}</div>`
      : ''}
    ${r.secrets?.length
      ? `<div class="info-secrets"><strong>Secrets:</strong> ${r.secrets.map(esc).join(' &bull; ')}</div>`
      : ''}
  `;
}

function clearInfo() {
  byId('room-info').innerHTML = '<div class="info-placeholder">Click a room tile to see details</div>';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

function bindGlobalEvents() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

    // Layer switching works regardless of selection
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveLayer((state.activeLayer - 1 + 11) % 11);
      return;
    } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveLayer((state.activeLayer + 1) % 11);
      return;
    }

    const cid = state.selected;
    if (!cid) return;
    const entry = state.map[cid];

    if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      if (entry) {
        entry.rotation = (entry.rotation - 90 + 360) % 360;
        renderCell(cid);
      }
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      if (entry) {
        entry.rotation = (entry.rotation + 90) % 360;
        renderCell(cid);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeFromMap(cid);
    }
  });

  byId('btn-screenshot').addEventListener('click', doScreenshot);
  byId('btn-save').addEventListener('click', saveLayout);
  byId('btn-load').addEventListener('click', () => byId('file-input').click());
  byId('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear all tiles from the map?')) return;
    Object.keys(state.map).forEach(cid => {
      delete state.map[cid];
      renderCell(cid);
    });
    state.selected = null;
    clearInfo();
  });
  byId('file-input').addEventListener('change', loadLayout);

  // Layer navigator
  byId('layer-prev').addEventListener('click', () => {
    setActiveLayer((state.activeLayer - 1 + 11) % 11);
  });
  byId('layer-next').addEventListener('click', () => {
    setActiveLayer((state.activeLayer + 1) % 11);
  });

  // Click on empty space deselects
  document.addEventListener('click', e => {
    if (!e.target.closest('.map-cell') && !e.target.closest('#left-panel') && !e.target.closest('#info-sidebar')) {
      if (state.selected) {
        cellEl(state.selected)?.classList.remove('selected');
        state.selected = null;
      }
    }
  });

  // Storage event: sync layer data changes from Room Layers page
  window.addEventListener('storage', e => {
    if (e.key !== LS_KEY || !e.newValue) return;
    try {
      const updated = JSON.parse(e.newValue);
      state.layerData = updated;
      state.activeLayer = updated.active ?? state.activeLayer;
      updateLayerNav();
      allCellIds().forEach(renderCell);
    } catch (_) {}
  });
}

// ── Screenshot ────────────────────────────────────────────────────────────────

async function doScreenshot() {
  if (typeof html2canvas === 'undefined') {
    alert('html2canvas not loaded. Check your internet connection (needed for screenshot library).');
    return;
  }

  const target = byId('screenshot-target');
  const textarea = byId('notes');
  const btn = byId('btn-screenshot');
  btn.textContent = '⏳ Capturing…';
  btn.disabled = true;

  document.body.classList.add('screenshotting');

  // html2canvas doesn't render <textarea> content or wrapping correctly.
  // Swap it for a plain div with identical geometry and text before capture.
  const style = getComputedStyle(textarea);
  const proxy = document.createElement('div');
  proxy.textContent = textarea.value;
  // Copy all relevant styles so it looks identical
  for (const prop of [
    'width','height','padding','margin','font','fontSize','fontFamily',
    'lineHeight','color','backgroundColor','border','borderRadius',
    'whiteSpace','overflowWrap','wordBreak','boxSizing',
  ]) {
    proxy.style[prop] = style[prop];
  }
  proxy.style.whiteSpace = 'pre-wrap';
  proxy.style.overflow = 'hidden';
  textarea.replaceWith(proxy);

  try {
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg').trim() || '#111318';
    const canvas = await html2canvas(target, {
      backgroundColor: bg,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      logging: false,
    });

    const link = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `blue-prince-layout-${ts}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('Screenshot error:', err);
    alert('Screenshot failed. See console for details.');
  } finally {
    proxy.replaceWith(textarea);
    document.body.classList.remove('screenshotting');
    btn.textContent = '📷 Screenshot';
    btn.disabled = false;
  }
}

// ── Save / Load ───────────────────────────────────────────────────────────────

function saveLayout() {
  const payload = {
    version: 1,
    timestamp: new Date().toISOString(),
    map: state.map,
    notes: byId('notes').value,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const link = document.createElement('a');
  link.download = `blue-prince-layout-${ts}.json`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function loadLayout(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.map) throw new Error('Missing map data');

      // Coerce roomId values to numbers (in case saved as strings)
      state.map = {};
      for (const [cid, entry] of Object.entries(data.map)) {
        state.map[cid] = {
          roomId: Number(entry.roomId),
          rotation: Number(entry.rotation) || 0,
        };
      }

      byId('notes').value = data.notes || '';

      // Re-render all cells
      allCellIds().forEach(renderCell);

      state.selected = null;
      clearInfo();
    } catch (err) {
      alert('Failed to load layout: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();
