'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const COLS = ['A', 'B', 'C', 'D', 'E'];
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ASSETS = 'blue-prince-room-index-export';

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

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  rooms: [],
  // cellId -> { roomId: number, rotation: 0|90|180|270 }
  map: {},
  selected: null,   // cellId or null
  drag: null,       // { source: 'menu'|'cell', roomId: number, fromCell?: string }
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

function allCellIds() {
  return ['grounds', ...ROWS.flatMap(r => COLS.map(c => `${c}${r}`))];
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
  buildLibrary();
  buildMap();
  setDefaults();
  bindGlobalEvents();
  clearInfo();
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

  const img = document.createElement('img');
  img.src = `${ASSETS}/${r.icon}`;
  img.alt = r.title;
  img.draggable = false;
  img.style.transform = `rotate(${entry.rotation}deg)`;
  tile.appendChild(img);

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

  // Rotation buttons — visible only when cell is selected
  tile.appendChild(makeRotateBtn('↺', 'rotate-btn-left',  'Rotate left (Q)',  () => {
    entry.rotation = (entry.rotation - 90 + 360) % 360;
    renderCell(cid);
  }));
  tile.appendChild(makeRotateBtn('↻', 'rotate-btn-right', 'Rotate right (E)', () => {
    entry.rotation = (entry.rotation + 90) % 360;
    renderCell(cid);
  }));

  cell.appendChild(tile);
  cell.classList.toggle('selected', state.selected === cid);
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

    const cid = state.selected;
    if (!cid) return;
    const entry = state.map[cid];

    if (e.key === 'q' || e.key === 'Q' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (entry) {
        entry.rotation = (entry.rotation - 90 + 360) % 360;
        renderCell(cid);
      }
    } else if (e.key === 'e' || e.key === 'E' || e.key === 'ArrowRight') {
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

  // Click on empty space deselects
  document.addEventListener('click', e => {
    if (!e.target.closest('.map-cell') && !e.target.closest('#left-panel') && !e.target.closest('#info-sidebar')) {
      if (state.selected) {
        cellEl(state.selected)?.classList.remove('selected');
        state.selected = null;
      }
    }
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
