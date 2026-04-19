'use strict';

// ── Constants ────────────────────────────────────────────────────────────────

const ASSETS = '../layout-organizer/blue-prince-room-index-export';
const LS_KEY  = 'bp-layers';

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

// Layer metadata (index 0 = Layer 1 in UI)
const LAYER_META = [
  { name: 'Room Tiles', type: 'tiles',   fixedName: true  },
  { name: 'PATH',       type: 'path',    fixedName: true  },
  { name: 'Room Color', type: 'color',   fixedName: true  },
  { name: 'Room #',     type: 'number',  fixedName: true  },
  { name: 'Element',    type: 'element', fixedName: true  },
  { name: 'Custom 1',   type: 'custom',  fixedName: false },
  { name: 'Custom 2',   type: 'custom',  fixedName: false },
  { name: 'Custom 3',   type: 'custom',  fixedName: false },
  { name: 'Custom 4',   type: 'custom',  fixedName: false },
  { name: 'Custom 5',   type: 'custom',  fixedName: false },
  { name: 'Custom 6',   type: 'custom',  fixedName: false },
];

// Which layer indices are editable (data-driven, not purely computed)
const EDITABLE_LAYERS = new Set([1, 2, 4, 5, 6, 7, 8, 9, 10]); // 0-indexed

// ── State ─────────────────────────────────────────────────────────────────────

let rooms = [];      // Array of room objects from rooms.json (all 115)
let layerData = null; // The shared bp-layers object
let stringViewCol = null; // Which column (0-indexed layer) is in string view, or null

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadLayerData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function saveLayerData() {
  localStorage.setItem(LS_KEY, JSON.stringify(layerData));
}

// Default PATH layer — one entry per room (1-110), committed 2026-04-18
const PATH_DEFAULT = '3T;4;2S;4;2L;2L;2S;2L;1;1;1;1;2L;2L;2L;2S;3T;1;2L;2S;2L;2S;1;2L;3T;1;2L;4;3T;2S;1;3T;2L;3T;2S;2L;1;1;1;1;3T;2L;3T;3T;4;1;2L;2L;1;1;1;1;1;1;3T;3T;3T;2S;4;2S;2S;4;1;2L;3T;4;2S;2L;2L;3T;2L;2L;1;2S;1;2L;2L;3T;1;3T;2L;4;3T;3T;4;1;2L;2S;1;2L;1;1;4;2L;1;4;2L;3T;2S;2L;2L;3T;1;1;1;1;1;1;1;1'.split(';');

// Default Room Color layer — one entry per room (1-110)
const COLOR_DEFAULT = 'blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;blue;rainbow;blue;blue;purple;purple;purple;purple;purple;purple;purple;purple;orange;orange;orange;orange;orange;orange;orange;orange;green;green;green;green;green;green;green;green;yellow;yellow;yellow;yellow;yellow;yellow;black/yellow;yellow;red;red;purple/red;red;red;red;red;red;blue;blue;blue;blue;green;purple;orange;yellow;blue;blue;black;blue/black;orange;green;red;red;blue;blue;blue;blue;green;purple;yellow;black'.split(';');

function initLayerData(roomList) {
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
    layerData = defaults;
    saveLayerData();
    return;
  }

  // Merge: fill missing fields
  layerData = existing;
  if (!Array.isArray(layerData.locked) || layerData.locked.length !== 11) {
    layerData.locked = defaults.locked;
  }
  if (!Array.isArray(layerData.path) || layerData.path.length !== 110) {
    layerData.path = defaults.path;
  }
  if (!Array.isArray(layerData.colors) || layerData.colors.length !== 110) {
    layerData.colors = defaults.colors;
  }
  if (!Array.isArray(layerData.element) || layerData.element.length !== 110) {
    layerData.element = defaults.element;
  }
  if (!Array.isArray(layerData.custom) || layerData.custom.length !== 6) {
    layerData.custom = defaults.custom;
  } else {
    layerData.custom.forEach((c, i) => {
      if (!c.name) c.name = defaults.custom[i].name;
      if (!Array.isArray(c.values) || c.values.length !== 110) {
        c.values = new Array(110).fill('');
      }
    });
  }
  if (typeof layerData.active !== 'number') layerData.active = 0;
  saveLayerData();
}

// Get the editable data array for a layer index (0-indexed)
function getLayerArray(layerIdx) {
  if (layerIdx === 1) return layerData.path;
  if (layerIdx === 2) return layerData.colors;
  if (layerIdx === 4) return layerData.element;
  if (layerIdx >= 5) return layerData.custom[layerIdx - 5].values;
  return null;
}

// ── Table building ────────────────────────────────────────────────────────────

function buildTable() {
  buildThead();
  buildTbody();
  updateActiveLayerHighlight();
}

function buildThead() {
  const nameRow     = document.getElementById('thead-names');
  const controlsRow = document.getElementById('thead-controls');

  // Clear existing layer columns (keep room col)
  while (nameRow.children.length > 1) nameRow.removeChild(nameRow.lastChild);
  while (controlsRow.children.length > 1) controlsRow.removeChild(controlsRow.lastChild);

  LAYER_META.forEach((meta, li) => {
    // Name header
    const th = document.createElement('th');
    th.className = 'layer-th';
    th.dataset.layer = li;

    const nameCell = document.createElement('div');
    nameCell.className = 'layer-name-cell';

    const numBadge = document.createElement('span');
    numBadge.className = 'layer-num';
    numBadge.textContent = li + 1;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name-text' + (meta.fixedName ? '' : ' editable');
    nameSpan.textContent = meta.type === 'custom' ? layerData.custom[li - 5].name : meta.name;
    if (!meta.fixedName) {
      nameSpan.contentEditable = 'true';
      nameSpan.spellcheck = false;
      nameSpan.addEventListener('blur', () => {
        layerData.custom[li - 5].name = nameSpan.textContent.trim() || `Custom ${li - 4}`;
        nameSpan.textContent = layerData.custom[li - 5].name;
        saveLayerData();
      });
      nameSpan.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
      });
    }

    nameCell.appendChild(numBadge);
    nameCell.appendChild(nameSpan);
    th.appendChild(nameCell);
    nameRow.appendChild(th);

    // Controls header
    const cth = document.createElement('th');
    cth.className = 'layer-th';
    cth.dataset.layer = li;

    const controls = document.createElement('div');
    controls.className = 'controls-cell';

    // Lock toggle (all layers)
    const lockBtn = document.createElement('button');
    lockBtn.className = 'btn-icon lock-btn' + (layerData.locked[li] ? ' locked' : '');
    lockBtn.title = layerData.locked[li] ? 'Unlock column (allow editing)' : 'Lock column (prevent editing)';
    lockBtn.textContent = layerData.locked[li] ? '🔒' : '🔓';
    lockBtn.addEventListener('click', () => toggleLock(li));
    controls.appendChild(lockBtn);

    // Reset to defaults (PATH, Color, and Element layers only)
    if (li === 1 || li === 2 || li === 4) {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn-icon reset-btn';
      resetBtn.title = 'Reset all values to built-in defaults';
      resetBtn.textContent = '↺ Reset';
      resetBtn.addEventListener('click', () => resetLayerToDefault(li));
      controls.appendChild(resetBtn);
    }

    // String view toggle (editable layers only)
    if (EDITABLE_LAYERS.has(li)) {
      const strBtn = document.createElement('button');
      strBtn.className = 'btn-icon str-btn';
      strBtn.title = 'Toggle string view (export/import as semicolon-separated list)';
      strBtn.textContent = '📋';
      strBtn.dataset.layer = li;
      strBtn.addEventListener('click', () => toggleStringView(li));
      controls.appendChild(strBtn);
    }

    // Delete button (custom layers only)
    if (meta.type === 'custom') {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-icon danger';
      delBtn.title = 'Clear all values in this layer';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', () => clearCustomLayer(li - 5));
      controls.appendChild(delBtn);
    }

    cth.appendChild(controls);
    controlsRow.appendChild(cth);
  });
}

function buildTbody() {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  // Only rooms 1–110
  const displayRooms = rooms.filter(r => r.id >= 1 && r.id <= 110);

  displayRooms.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.roomId = r.id;

    // Room cell (sticky)
    const tdRoom = document.createElement('td');
    tdRoom.className = 'sticky-col';
    const roomDiv = document.createElement('div');
    roomDiv.className = 'room-cell';

    const img = document.createElement('img');
    img.className = 'room-thumb';
    img.src = `${ASSETS}/${r.icon}`;
    img.alt = r.title;

    const idSpan = document.createElement('span');
    idSpan.className = 'room-id';
    idSpan.textContent = r.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'room-name';
    nameSpan.textContent = r.title;
    nameSpan.title = r.title;

    roomDiv.appendChild(img);
    roomDiv.appendChild(idSpan);
    roomDiv.appendChild(nameSpan);
    tdRoom.appendChild(roomDiv);
    tr.appendChild(tdRoom);

    // Layer cells
    LAYER_META.forEach((meta, li) => {
      const td = document.createElement('td');
      td.className = 'layer-cell';
      td.dataset.layer = li;
      td.dataset.roomIdx = r.id - 1; // 0-indexed

      renderLayerCell(td, r, li);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// Render content of a single layer cell
function renderLayerCell(td, r, li) {
  td.innerHTML = '';
  // Remove any stale click listener before potentially re-adding it
  td.removeEventListener('click', onCellClick);
  td.classList.remove('editable');

  const meta = LAYER_META[li];
  const locked = layerData.locked[li];

  if (meta.type === 'tiles') {
    // Layer 1: room tile thumbnail
    const img = document.createElement('img');
    img.className = 'room-thumb';
    img.src = `${ASSETS}/${r.icon}`;
    img.alt = r.title;
    td.appendChild(img);
    return;
  }

  if (meta.type === 'color') {
    const colorKey = layerData.colors[r.id - 1] || COLOR_DEFAULT[r.id - 1];
    td.classList.toggle('cell-modified', layerData.colors[r.id - 1] !== COLOR_DEFAULT[r.id - 1]);
    const swatch = document.createElement('span');
    swatch.className = 'cell-color-swatch';
    swatch.style.background = colorSwatchBackground(colorKey);
    td.appendChild(swatch);
    const label = document.createElement('span');
    label.style.cssText = 'margin-left:5px;font-size:11px';
    label.textContent = colorKey;
    td.appendChild(label);
    if (!locked) {
      td.classList.add('editable');
      td.addEventListener('click', onCellClick);
    }
    return;
  }

  if (meta.type === 'number') {
    // Layer 4: plain room number text
    td.textContent = r.id;
    return;
  }

  if (meta.type === 'path') {
    // Layer 2: path icon (rotated to match the code) + code label
    const val = layerData.path[r.id - 1] || '';
    td.classList.toggle('cell-modified', val !== (PATH_DEFAULT[r.id - 1] || ''));
    if (val) {
      const pathInfo = PATH_CODE_MAP[val];
      if (pathInfo) {
        const pathRoom = rooms.find(rm => rm.id === pathInfo.iconId);
        if (pathRoom) {
          const img = document.createElement('img');
          img.className = 'cell-path-img';
          img.src = `${ASSETS}/${pathRoom.icon}`;
          img.alt = val;
          if (pathInfo.baseRot) img.style.transform = `rotate(${pathInfo.baseRot}deg)`;
          td.appendChild(img);
        }
      }
      const label = document.createElement('span');
      label.style.marginLeft = '4px';
      label.style.fontSize = '11px';
      label.textContent = val;
      td.appendChild(label);
    }
    if (!locked) {
      td.classList.add('editable');
      td.addEventListener('click', onCellClick);
    }
    return;
  }

  if (meta.type === 'element') {
    // Plain text
    const val = layerData.element[r.id - 1] || '';
    td.classList.toggle('cell-modified', val !== (ELEMENTS[r.id - 1] || ''));
    td.textContent = val;
    if (!locked) {
      td.classList.add('editable');
      td.addEventListener('click', onCellClick);
    }
    return;
  }

  if (meta.type === 'custom') {
    // Plain text
    const val = layerData.custom[li - 5].values[r.id - 1] || '';
    td.textContent = val;
    if (!locked) {
      td.classList.add('editable');
      td.addEventListener('click', onCellClick);
    }
    return;
  }
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const COLOR_ALIASES = { violet: 'purple', all: 'rainbow' };
const VALID_COLORS  = new Set(['blue','purple','orange','green','yellow','red','black','rainbow']);

function normalizeColorValue(str) {
  if (!str.trim()) return '';
  const parts = str.split('/').map(p => {
    const k = p.trim().toLowerCase();
    return COLOR_ALIASES[k] ?? k;
  });
  if (parts.some(p => !VALID_COLORS.has(p))) return null; // invalid
  return parts.join('/');
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

// Maps path codes to { iconId, baseRot } — must stay in sync with layout-organizer/app.js
const PATH_CODE_MAP = {
  '1':  { iconId: 111, baseRot: 0   },
  '2L': { iconId: 112, baseRot: 90  },
  '2R': { iconId: 112, baseRot: 0   },
  '2S': { iconId: 113, baseRot: 0   },
  '3L': { iconId: 114, baseRot: 180 },
  '3R': { iconId: 114, baseRot: 270 },
  '3T': { iconId: 114, baseRot: 90  },
  '4':  { iconId: 115, baseRot: 0   },
};

function pathCodeToIconId(code) {
  return PATH_CODE_MAP[code]?.iconId ?? null;
}

// ── Cell editing ──────────────────────────────────────────────────────────────

let activeInput = null; // currently active cell input

function onCellClick(e) {
  // Don't re-activate if already active
  if (activeInput && activeInput.closest('td') === e.currentTarget) return;
  // Ignore if in string view mode
  if (stringViewCol !== null) return;
  activateCell(e.currentTarget);
}

function activateCell(td) {
  if (activeInput) commitActiveInput();

  const li    = parseInt(td.dataset.layer);
  const rIdx  = parseInt(td.dataset.roomIdx);
  const arr   = getLayerArray(li);
  const val   = arr ? arr[rIdx] || '' : '';

  td.classList.add('focused');
  td.innerHTML = '';

  const input = document.createElement('input');
  input.className = 'cell-input';
  input.type = 'text';
  input.value = val;
  input.maxLength = LAYER_META[li].type === 'color' ? 30 : 10;
  td.appendChild(input);
  input.focus();
  input.select();
  activeInput = input;

  input.addEventListener('blur', () => commitActiveInput());
  input.addEventListener('keydown', handleCellKeydown);
}

function commitActiveInput() {
  if (!activeInput) return;
  const td  = activeInput.closest('td');
  if (!td) { activeInput = null; return; }
  const li   = parseInt(td.dataset.layer);
  const rIdx = parseInt(td.dataset.roomIdx);
  const arr  = getLayerArray(li);
  if (arr) {
    let val = activeInput.value.trim();
    if (LAYER_META[li].type === 'color') {
      const normalized = normalizeColorValue(val);
      if (normalized === null) val = arr[rIdx];          // revert if invalid
      else if (normalized === '') val = COLOR_DEFAULT[rIdx]; // empty = reset to default
      else val = normalized;
    }
    arr[rIdx] = val;
    saveLayerData();
  }
  activeInput = null;
  td.classList.remove('focused');

  // Re-render the cell (renderLayerCell handles editability)
  const roomId = rIdx + 1;
  const r = rooms.find(rm => rm.id === roomId);
  if (r) renderLayerCell(td, r, li);
}

function handleCellKeydown(e) {
  if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
    const forward = !(e.shiftKey);
    const td = activeInput.closest('td');
    const li = parseInt(td.dataset.layer);
    commitActiveInput();
    moveToAdjacentCell(td, li, forward);
  }
  if (e.key === 'Escape') {
    const td = activeInput.closest('td');
    activeInput = null;
    td.classList.remove('focused');
    const li     = parseInt(td.dataset.layer);
    const rIdx   = parseInt(td.dataset.roomIdx);
    const roomId = rIdx + 1;
    const r = rooms.find(rm => rm.id === roomId);
    if (r) renderLayerCell(td, r, li);
  }
}

function moveToAdjacentCell(fromTd, li, forward) {
  const allRows = Array.from(document.querySelectorAll('#table-body tr'));
  const fromRowIdx = allRows.findIndex(tr => tr.contains(fromTd));
  const nextRowIdx = forward ? fromRowIdx + 1 : fromRowIdx - 1;
  if (nextRowIdx < 0 || nextRowIdx >= allRows.length) return;

  const nextRow = allRows[nextRowIdx];
  const nextTd = nextRow.querySelector(`td[data-layer="${li}"]`);
  if (nextTd && nextTd.classList.contains('editable')) {
    nextTd.scrollIntoView({ block: 'nearest' });
    activateCell(nextTd);
  }
}

// ── Lock toggle ───────────────────────────────────────────────────────────────

function toggleLock(li) {
  layerData.locked[li] = !layerData.locked[li];
  saveLayerData();
  rebuildColumn(li);
  document.querySelectorAll(`[data-layer="${li}"] .lock-btn`).forEach(btn => {
    btn.textContent = layerData.locked[li] ? '🔒' : '🔓';
    btn.title = layerData.locked[li] ? 'Unlock column (allow editing)' : 'Lock column (prevent editing)';
    btn.classList.toggle('locked', layerData.locked[li]);
  });
}

function resetLayerToDefault(li) {
  const name = li === 1 ? 'PATH' : li === 2 ? 'Room Color' : 'Element';
  if (!confirm(`Reset the ${name} layer to built-in default values?`)) return;
  if (li === 1) layerData.path   = [...PATH_DEFAULT];
  if (li === 2) layerData.colors = [...COLOR_DEFAULT];
  if (li === 4) layerData.element = [...ELEMENTS];
  saveLayerData();
  rebuildColumn(li);
}

function rebuildColumn(li) {
  // Re-render all cells in the layer column (renderLayerCell handles editability)
  document.querySelectorAll(`td.layer-cell[data-layer="${li}"]`).forEach(td => {
    const rIdx  = parseInt(td.dataset.roomIdx);
    const roomId = rIdx + 1;
    const r = rooms.find(rm => rm.id === roomId);
    if (r) renderLayerCell(td, r, li);
  });
}

// ── Clear custom layer ────────────────────────────────────────────────────────

function clearCustomLayer(customIdx) {
  if (!confirm(`Clear all values in "${layerData.custom[customIdx].name}"?`)) return;
  layerData.custom[customIdx].values = new Array(110).fill('');
  saveLayerData();
  rebuildColumn(customIdx + 5);
}

// ── String view ───────────────────────────────────────────────────────────────

function toggleStringView(li) {
  if (stringViewCol === li) {
    applyStringView(li);
  } else {
    if (stringViewCol !== null) closeStringView(stringViewCol, false);
    openStringView(li);
  }
}

function openStringView(li) {
  if (activeInput) commitActiveInput();
  stringViewCol = li;

  const arr = getLayerArray(li);
  const str = (arr || []).join(';');

  // Freeze the table
  document.getElementById('layer-table').classList.add('table-frozen');

  // Position the overlay below the column's control header cell using fixed positioning
  const ctrlTh = document.querySelector(`#thead-controls th[data-layer="${li}"]`);
  const anchorRect = ctrlTh ? ctrlTh.getBoundingClientRect() : { left: 200, bottom: 80, width: 110 };

  const overlay = document.createElement('div');
  overlay.id = `str-overlay-${li}`;
  overlay.className = 'string-view-overlay';

  // Position fixed, anchored below the column header
  const overlayWidth = Math.max(anchorRect.width, 220);
  const viewportHeight = window.innerHeight;
  const top = anchorRect.bottom + 4;
  const maxHeight = viewportHeight - top - 20;

  overlay.style.position = 'fixed';
  overlay.style.left = anchorRect.left + 'px';
  overlay.style.top  = top + 'px';
  overlay.style.width = overlayWidth + 'px';
  overlay.style.maxHeight = Math.max(maxHeight, 200) + 'px';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.gap = '6px';
  document.body.appendChild(overlay);

  const textarea = document.createElement('textarea');
  textarea.className = 'string-view-textarea';
  textarea.value = str;
  textarea.style.flex = '1';
  textarea.style.minHeight = '120px';
  overlay.appendChild(textarea);

  const errDiv = document.createElement('div');
  errDiv.className = 'string-view-error';
  overlay.appendChild(errDiv);

  const btnRow = document.createElement('div');
  btnRow.className = 'string-view-buttons';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-icon';
  copyBtn.textContent = '📋 Copy';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(textarea.value).then(() => {
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
    });
  });

  const applyBtn = document.createElement('button');
  applyBtn.className = 'btn-icon active';
  applyBtn.textContent = '✓ Apply';
  applyBtn.addEventListener('click', () => applyStringView(li, textarea.value, errDiv));

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-icon';
  cancelBtn.textContent = '✕ Cancel';
  cancelBtn.addEventListener('click', () => closeStringView(li, false));

  btnRow.appendChild(copyBtn);
  btnRow.appendChild(applyBtn);
  btnRow.appendChild(cancelBtn);
  overlay.appendChild(btnRow);

  // Highlight the string-view toggle button
  document.querySelectorAll(`#thead-controls th[data-layer="${li}"] .str-btn`)
    .forEach(b => b.classList.add('active'));

  textarea.focus();
}

function applyStringView(li, strOverride, errDiv) {
  const overlay = document.getElementById(`str-overlay-${li}`);
  const textarea = overlay ? overlay.querySelector('textarea') : null;
  const str = strOverride !== undefined ? strOverride : (textarea ? textarea.value : '');
  const errEl = errDiv || (overlay ? overlay.querySelector('.string-view-error') : null);

  // Empty string → treat as clearing all values (109 semicolons)
  const normalized = str.trim() === '' ? ';'.repeat(109) : str;

  // Validate: must have exactly 109 semicolons
  const parts = normalized.split(';');
  if (parts.length !== 110) {
    const msg = `Expected 110 values (109 semicolons), got ${parts.length} values (${parts.length - 1} semicolons).`;
    if (errEl) { errEl.textContent = msg; }
    if (textarea) textarea.classList.add('error');
    return;
  }

  const arr = getLayerArray(li);
  if (arr) {
    for (let i = 0; i < 110; i++) {
      let val = parts[i].trim();
      if (li === 2) {
        const normalized = normalizeColorValue(val);
        if (normalized === null) {
          if (errEl) errEl.textContent = `Invalid color "${val}" at position ${i + 1}. Use: blue, purple, orange, green, yellow, red, black, rainbow, or combos like "red/black".`;
          if (textarea) textarea.classList.add('error');
          return;
        }
        val = normalized || COLOR_DEFAULT[i];
      }
      arr[i] = val;
    }
    saveLayerData();
  }
  closeStringView(li, true);
  rebuildColumn(li);
}

function closeStringView(li, applied) {
  const overlay = document.getElementById(`str-overlay-${li}`);
  if (overlay) overlay.remove();

  document.getElementById('layer-table').classList.remove('table-frozen');

  document.querySelectorAll(`#thead-controls th[data-layer="${li}"] .str-btn`)
    .forEach(b => b.classList.remove('active'));

  stringViewCol = null;
}

// ── Active layer highlight ────────────────────────────────────────────────────

function updateActiveLayerHighlight() {
  const active = layerData.active;
  document.querySelectorAll('.layer-th').forEach(th => {
    const li = parseInt(th.dataset.layer);
    th.classList.toggle('col-active-header', li === active);
  });
  document.querySelectorAll('td.layer-cell').forEach(td => {
    const li = parseInt(td.dataset.layer);
    td.classList.toggle('col-active-cell', li === active);
  });
}

// ── Storage event (sync from Layout Organizer) ────────────────────────────────

window.addEventListener('storage', e => {
  if (e.key !== LS_KEY || !e.newValue) return;
  try {
    const updated = JSON.parse(e.newValue);
    layerData = updated;
    // Ensure arrays are correct length (defensive)
    if (!Array.isArray(layerData.path) || layerData.path.length !== 110) layerData.path = new Array(110).fill('');
    if (!Array.isArray(layerData.element) || layerData.element.length !== 110) layerData.element = [...ELEMENTS];
    // Rebuild table to reflect changes
    buildTable();
  } catch (_) {}
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  let data;
  try {
    const res = await fetch(`${ASSETS}/rooms.json?v=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    document.getElementById('table-wrapper').innerHTML =
      '<div style="padding:40px;color:#e87777;text-align:center">' +
      'Could not load room data. Serve from a local HTTP server: ' +
      '<code>python3 -m http.server 8080</code></div>';
    console.error(e);
    return;
  }

  rooms = data.rooms;
  initLayerData(rooms);
  buildTable();
}

init();
