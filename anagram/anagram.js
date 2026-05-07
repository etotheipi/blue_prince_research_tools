'use strict';

const DATA_ROOT = '../data';

// ── Common words (buttons, not scroll list) ───────────────────────────────────
// Populated from data/common_words.txt at startup. Falls back to {} if missing.
let COMMON_WORDS = new Set();

// ── Category file definitions (alphabetical). Numbers added as 9th category.
const CATEGORY_FILES = [
  { key: 'angels',         label: 'Angels' },
  { key: 'constellations', label: 'Constellations' },
  { key: 'erajan',         label: 'Erajan' },
  { key: 'items',          label: 'Items' },
  { key: 'numbers',        label: 'Numbers' },
  { key: 'people',         label: 'People' },
  { key: 'places',         label: 'Places' },
  { key: 'powers',         label: 'Powers' },
  { key: 'rooms',          label: 'Rooms' },
];

// ── Worker setup ──────────────────────────────────────────────────────────────

const worker = new Worker('worker.js');

worker.onmessage = function (e) {
  const msg = e.data;
  if      (msg.type === 'loaded')     onWorkerLoaded(msg);
  else if (msg.type === 'candidates') onCandidates(msg);
  else if (msg.type === 'complete')   onComplete(msg);
  else if (msg.type === 'error')      setStatus(msg.message || 'Worker error', 'error');
};

worker.onerror = function (err) {
  setStatus('Worker error: ' + err.message, 'error');
};

// ── State ─────────────────────────────────────────────────────────────────────

const SCORE_THRESHOLD = 8; // effective score at/above this is a "headline" word

const MANUAL_STORAGE_KEY = 'anagramBuddy.manualWords.v1';

const state = {
  baseInput:         '',
  baseLetters:       [],
  selectedWords:     [],
  categories:        [],   // [{key, label, words: Set, sortedList: string[]}]
  manualList:        [],   // user-added words (persisted in localStorage)
  priorityList:      [],   // static bulk list (priority_words.json + corpus) — sorted
  bonus4Set:         new Set(), // categories + manual → +4 score bonus
  bonus2Set:         new Set(), // priorityList → +2 score bonus
  generalCandidates: [],   // formable words not in any priority/common set
  lastGroups:        [],   // grouped complete-anagram results for click handlers
};

let fetchTimer    = null;
let completeTimer = null;

// ── Boot ──────────────────────────────────────────────────────────────────────

setStatus('Loading wordlist…', 'loading');

const wordlistUrl = new URL(`${DATA_ROOT}/words84k.txt`, window.location.href).href;
worker.postMessage({ type: 'load', url: wordlistUrl });

// ── Worker callbacks ──────────────────────────────────────────────────────────

function onWorkerLoaded({ count }) {
  setStatus(`Ready — ${count.toLocaleString()} words loaded`, 'ready');
  document.getElementById('base-input').disabled = false;

  const fetchText = url => fetch(url).then(r => r.ok ? r.text() : '').catch(() => '');
  const fetchJson = url => fetch(url).then(r => r.ok ? r.json() : []).catch(() => []);

  Promise.all([
    fetchText(new URL(`${DATA_ROOT}/common_words.txt`, window.location.href).href),
    ...CATEGORY_FILES.map(c =>
      fetchText(new URL(`${DATA_ROOT}/anagram_cateogries/${c.key}.txt`, window.location.href).href)
    ),
    fetchJson(new URL(`${DATA_ROOT}/priority_words.json`, window.location.href).href),
    fetchText(new URL(`${DATA_ROOT}/word_list_full_corpus.txt`, window.location.href).href),
  ]).then(results => {
    const commonText   = results[0];
    const catTexts     = results.slice(1, 1 + CATEGORY_FILES.length);
    const priorityJson = results[1 + CATEGORY_FILES.length];
    const corpusText   = results[2 + CATEGORY_FILES.length];

    // 1. Common words first — used as a filter when normalizing categories
    COMMON_WORDS = parseCommonWords(commonText);

    // 2. Category sets
    state.categories = CATEGORY_FILES.map((def, i) => {
      const words = processTextList(catTexts[i]);
      return { key: def.key, label: def.label, words: new Set(words), sortedList: words };
    });

    const allCatWords = new Set();
    for (const cat of state.categories) for (const w of cat.words) allCatWords.add(w);

    // 3. Manual list from localStorage
    state.manualList = loadManualList().filter(w => !allCatWords.has(w) && !COMMON_WORDS.has(w));

    // 4. Bonus +4 set: categories ∪ manual
    state.bonus4Set = new Set([...allCatWords, ...state.manualList]);

    // 5. Bonus +2 set: priority_words.json ∪ corpus, minus bonus4 and common
    const priorityRaw = [];
    if (Array.isArray(priorityJson)) {
      for (const w of priorityJson) {
        const word = String(w).toLowerCase().trim();
        if (/^[a-z]{2,}$/.test(word)) priorityRaw.push(word);
      }
    }
    for (const line of String(corpusText).split('\n')) {
      const word = line.trim().toLowerCase();
      if (/^[a-z]{2,}$/.test(word)) priorityRaw.push(word);
    }
    const prioritySeen = new Set();
    const priorityClean = [];
    for (const w of priorityRaw) {
      if (prioritySeen.has(w)) continue;
      prioritySeen.add(w);
      if (state.bonus4Set.has(w) || COMMON_WORDS.has(w)) continue;
      priorityClean.push(w);
    }
    priorityClean.sort();
    state.priorityList = priorityClean;
    state.bonus2Set    = new Set(priorityClean);

    renderAll();
    scheduleFetch();
    scheduleCompleteFetch();
  });
}

function onCandidates({ candidates }) {
  // Dictionary box = formable words that aren't common, manual, category, or priority
  state.generalCandidates = candidates.filter(
    w => !COMMON_WORDS.has(w) && !state.bonus4Set.has(w) && !state.bonus2Set.has(w)
  );
  renderGeneralBox();
}

function onComplete({ solutions, timedOut, cappedKeys }) {
  renderCompleteAnagrams(solutions, timedOut, cappedKeys || []);
}

// ── Normalization ─────────────────────────────────────────────────────────────

function parseCommonWords(text) {
  const set = new Set();
  for (const line of String(text).split('\n')) {
    const w = line.trim().toLowerCase();
    if (/^[a-z]+$/.test(w)) set.add(w);
  }
  return set;
}

function processTextList(text) {
  const words = new Set();
  for (const line of text.split('\n')) {
    const cleaned = line.replace(/'/g, '').replace(/[^a-zA-Z\s]/g, ' ');
    for (const token of cleaned.split(/\s+/)) {
      const w = token.toLowerCase().trim();
      if (/^[a-z]{2,}$/.test(w) && !COMMON_WORDS.has(w)) words.add(w);
    }
  }
  return [...words].sort();
}

// ── Manual list persistence ───────────────────────────────────────────────────

function loadManualList() {
  try {
    const raw = localStorage.getItem(MANUAL_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(w => /^[a-z]{2,}$/.test(w)) : [];
  } catch { return []; }
}

function saveManualList() {
  try {
    localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(state.manualList));
  } catch { /* localStorage unavailable: silent */ }
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('base-input').addEventListener('input', function () {
  state.baseInput   = this.value;
  state.baseLetters = [...this.value.toLowerCase()].filter(c => /[a-z]/.test(c));
  state.selectedWords = [];
  renderAll();
  scheduleFetch();
  scheduleCompleteFetch();
});

document.getElementById('word-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTypedWord();
});
document.getElementById('word-input').addEventListener('input', function () {
  const w = this.value.trim().toLowerCase();
  if (!w) { clearMsg(); return; }
  validateWord(w);
});

document.getElementById('manual-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addManualWord();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function freq(letters) {
  const map = {};
  for (const c of letters) map[c] = (map[c] || 0) + 1;
  return map;
}

function getAvailableLetters() {
  const pool = letterPool();
  const result = [];
  for (const [c, n] of Object.entries(pool)) {
    for (let i = 0; i < n; i++) result.push(c);
  }
  return result;
}

function letterPool() {
  const pool = freq(state.baseLetters);
  for (const word of state.selectedWords) {
    for (const c of word) { if (pool[c] > 0) pool[c]--; }
  }
  return pool;
}

function canFormFromPool(word, pool) {
  const need = freq(word);
  for (const [c, n] of Object.entries(need)) {
    if ((pool[c] || 0) < n) return false;
  }
  return true;
}

function isPriorityHighlight(w) {
  return state.bonus4Set.has(w) || state.bonus2Set.has(w);
}

function scoreWord(w) {
  if (state.bonus4Set.has(w)) return w.length + 4;
  if (state.bonus2Set.has(w)) return w.length + 2;
  return w.length;
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderAll() {
  renderLetterPool();
  renderSelectedWords();
  renderCommonButtons();
  renderWordBoxes();
}

function renderLetterPool() {
  const el      = document.getElementById('letter-pool');
  const countEl = document.getElementById('pool-count');

  if (!state.baseInput.trim()) {
    el.innerHTML = '<span class="pool-placeholder">Enter a phrase above to begin</span>';
    countEl.textContent = '';
    return;
  }

  const consumed = {};
  for (const word of state.selectedWords) {
    for (const c of word) consumed[c] = (consumed[c] || 0) + 1;
  }

  const remaining = { ...consumed };
  let html = '';
  let prevWasLetter = false;

  for (const ch of state.baseInput) {
    const isAlpha = /[a-zA-Z]/.test(ch);
    if (!isAlpha) {
      if (prevWasLetter) html += '<span class="letter-sep"></span>';
      prevWasLetter = false;
      continue;
    }
    const lc = ch.toLowerCase();
    if ((remaining[lc] || 0) > 0) {
      remaining[lc]--;
      html += `<span class="letter-tile used">${ch.toUpperCase()}</span>`;
    } else {
      html += `<span class="letter-tile avail">${ch.toUpperCase()}</span>`;
    }
    prevWasLetter = true;
  }

  el.innerHTML = html || '<span class="pool-placeholder">No letters</span>';

  const avail = getAvailableLetters().length;
  const total = state.baseLetters.length;
  countEl.textContent = avail === total
    ? `(${total} letters)`
    : `(${avail} of ${total} remaining)`;
}

function renderSelectedWords() {
  const el   = document.getElementById('selected-words-wrap');
  const hint = document.getElementById('undo-hint');
  if (state.selectedWords.length === 0) {
    el.innerHTML = '<span class="selected-placeholder">Nothing selected yet</span>';
    hint.style.display = 'none';
    return;
  }
  hint.style.display = '';
  el.innerHTML = state.selectedWords.map((word, i) =>
    `<button class="word-tile" onclick="removeFrom(${i})" title="Remove &quot;${word}&quot;">
      ${word}<span class="x">✕</span>
    </button>`
  ).join('');
}

function renderCommonButtons() {
  const el = document.getElementById('common-buttons');
  if (!el) return;
  const pool = letterPool();
  const sorted = [...COMMON_WORDS].sort();
  if (sorted.length === 0) {
    el.innerHTML = '<span style="color:#cbd5e0;font-style:italic;font-size:0.82rem">(no common words loaded)</span>';
    return;
  }
  el.innerHTML = sorted.map(w => {
    const avail = canFormFromPool(w, pool);
    if (avail) {
      return `<button class="common-btn avail" onclick="addWord('${w}')">${w}</button>`;
    } else {
      return `<button class="common-btn unavail" disabled>${w}</button>`;
    }
  }).join('');
}

function renderWordBoxes() {
  const pool = letterPool();

  // Categories (9 of them, including numbers)
  for (const cat of state.categories) {
    const bodyEl  = document.getElementById(`box-${cat.key}`);
    const countEl = document.getElementById(`cnt-${cat.key}`);
    if (!bodyEl) continue;

    const avail = cat.sortedList.filter(w => canFormFromPool(w, pool));
    avail.sort((a, b) => b.length - a.length);
    countEl.textContent = avail.length;

    if (avail.length === 0) {
      bodyEl.innerHTML = '<div class="box-placeholder">—</div>';
    } else {
      bodyEl.innerHTML = avail.map(w =>
        `<div class="box-item" onclick="addWord('${w}')">${w}<span class="item-len">${w.length}</span></div>`
      ).join('');
    }
  }

  // Manual box (user-added, with remove buttons)
  const manualBody  = document.getElementById('box-manual');
  const manualCount = document.getElementById('cnt-manual');
  if (manualBody) {
    const avail = state.manualList.filter(w => canFormFromPool(w, pool));
    avail.sort((a, b) => b.length - a.length);
    manualCount.textContent = avail.length;

    if (state.manualList.length === 0) {
      manualBody.innerHTML = '<div class="box-placeholder">add words below</div>';
    } else if (avail.length === 0) {
      manualBody.innerHTML = '<div class="box-placeholder">none formable</div>';
    } else {
      const removeBtn = w =>
        `<button class="pri-remove" onclick="event.stopPropagation();removeManualWord('${w}')" title="Remove">✕</button>`;
      manualBody.innerHTML = avail.map(w =>
        `<div class="box-item" onclick="addWord('${w}')">${w}<span class="item-len">${w.length}</span>${removeBtn(w)}</div>`
      ).join('');
    }
  }

  // Priority Words box (static, no remove)
  const priBody  = document.getElementById('box-priority');
  const priCount = document.getElementById('cnt-priority');
  if (priBody) {
    const avail = state.priorityList.filter(w => canFormFromPool(w, pool));
    avail.sort((a, b) => b.length - a.length);
    priCount.textContent = avail.length;

    if (avail.length === 0) {
      priBody.innerHTML = '<div class="box-placeholder">—</div>';
    } else {
      priBody.innerHTML = avail.map(w =>
        `<div class="box-item" onclick="addWord('${w}')">${w}<span class="item-len">${w.length}</span></div>`
      ).join('');
    }
  }
}

function renderGeneralBox() {
  const bodyEl  = document.getElementById('box-dictionary');
  const countEl = document.getElementById('cnt-dictionary');
  if (!bodyEl) return;

  const words = state.generalCandidates;
  countEl.textContent = words.length;

  if (words.length === 0) {
    bodyEl.innerHTML = '<div class="box-placeholder">—</div>';
  } else {
    bodyEl.innerHTML = words.map(w =>
      `<div class="box-item" onclick="addWord('${w}')">${w}<span class="item-len">${w.length}</span></div>`
    ).join('');
  }
}

function groupSolutions(solutions, cappedKeys) {
  const cappedSet = new Set(cappedKeys);
  const groupMap  = new Map();

  for (const sol of solutions) {
    const headline = sol
      .filter(w => scoreWord(w) >= SCORE_THRESHOLD)
      .sort((a, b) => scoreWord(b) - scoreWord(a) || a.localeCompare(b));
    const key = headline.join('\0');
    if (!groupMap.has(key)) groupMap.set(key, { headline, members: [], capped: cappedSet.has(key) });
    groupMap.get(key).members.push(sol);
  }

  const groups = [...groupMap.values()];

  groups.sort((a, b) => {
    const la = a.headline.map(scoreWord);
    const lb = b.headline.map(scoreWord);
    for (let i = 0; i < Math.min(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) return lb[i] - la[i];
    }
    if (la.length !== lb.length) return lb.length - la.length;
    return a.headline.join('\0').localeCompare(b.headline.join('\0'));
  });

  return groups;
}

function renderCompleteAnagrams(solutions, timedOut, cappedKeys = []) {
  const listEl  = document.getElementById('complete-list');
  const countEl = document.getElementById('complete-count');

  if (!solutions || solutions.length === 0) {
    listEl.innerHTML = '<div class="list-placeholder">No complete solutions found</div>';
    countEl.textContent = '0';
    return;
  }

  countEl.textContent = solutions.length + (timedOut ? '+' : '');

  const groups = groupSolutions(solutions, cappedKeys);
  state.lastGroups = groups;

  const selected = state.selectedWords;
  const selPills = selected.map(w =>
    `<span class="sol-word sol-selected-word${isPriorityHighlight(w) ? ' sol-priority' : ''}">${w}</span>`
  ).join('');

  const renderFlat = (gIdx, members) => members.map((sol, mIdx) => {
    const pills = sol.map(w =>
      `<span class="sol-word${isPriorityHighlight(w) ? ' sol-priority' : ''}">${w}</span>`
    ).join('');
    return `<div class="solution-item" onclick="selectSolution(${gIdx},${mIdx})">
      <div class="solution-words">${selPills}${pills}</div>
    </div>`;
  }).join('');

  let html = '';
  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    const { headline, members, capped } = groups[gIdx];
    const showFlat = headline.length === 0 || (!capped && members.length <= 3);

    if (showFlat) {
      html += renderFlat(gIdx, members);
    } else {
      const headlinePills = headline.map(w =>
        `<span class="sol-word sol-priority">${w}</span>`
      ).join('');
      const countStr = capped ? '100+' : String(members.length);
      html += `<div class="solution-group" onclick="selectGroup(${gIdx})">
        <div class="solution-words">${selPills}${headlinePills}<span class="group-ellipsis">…</span><span class="group-count">${countStr}</span></div>
      </div>`;
    }
  }

  listEl.innerHTML = html + (timedOut
    ? '<div class="timeout-note">Search limit reached — more solutions may exist</div>'
    : '');
}

// ── Actions ───────────────────────────────────────────────────────────────────

function addWord(word) {
  word = word.toLowerCase().trim();
  if (!word) return;
  clearMsg();

  const pool = letterPool();
  const need = freq(word);
  const errors = [];
  for (const [c, n] of Object.entries(need)) {
    const avail = pool[c] || 0;
    if (avail < n) {
      errors.push(avail === 0
        ? `"${c}" is not available`
        : `only ${avail} "${c}" available, you need ${n}`);
    }
  }

  if (errors.length) { showMsg(errors.join('; '), 'error'); return; }

  state.selectedWords.push(word);
  document.getElementById('word-input').value = '';
  renderAll();
  scheduleFetch();
  scheduleCompleteFetch();
}

function addTypedWord() {
  addWord(document.getElementById('word-input').value);
}

function removeFrom(index) {
  state.selectedWords = state.selectedWords.filter((_, i) => i !== index);
  renderAll();
  scheduleFetch();
  scheduleCompleteFetch();
}

function addManualWord() {
  const inp = document.getElementById('manual-input');
  const raw = inp.value;
  inp.value = '';
  const words = raw.split(/[\s,]+/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{2,}$/.test(w));
  let added = false;
  for (const word of words) {
    if (COMMON_WORDS.has(word)) continue;
    if (state.bonus4Set.has(word)) continue; // already in a category or manual
    state.manualList.push(word);
    state.bonus4Set.add(word);
    // If it was in priority, demote it (manual takes precedence)
    if (state.bonus2Set.has(word)) {
      state.bonus2Set.delete(word);
      state.priorityList = state.priorityList.filter(w => w !== word);
    }
    added = true;
  }
  if (added) {
    saveManualList();
    renderAll();
    scheduleCompleteFetch(); // priority-set changed, re-score
  }
}

function removeManualWord(word) {
  if (!state.manualList.includes(word)) return;
  state.manualList = state.manualList.filter(w => w !== word);
  // Don't remove from bonus4Set if also in a category
  const inCategory = state.categories.some(cat => cat.words.has(word));
  if (!inCategory) state.bonus4Set.delete(word);
  saveManualList();
  renderAll();
  scheduleCompleteFetch();
}

function selectGroup(gIdx) {
  const group = state.lastGroups[gIdx];
  if (!group) return;
  state.selectedWords = [...state.selectedWords, ...group.headline];
  renderAll();
  scheduleFetch();
  scheduleCompleteFetch();
}

function selectSolution(gIdx, mIdx) {
  const group = state.lastGroups[gIdx];
  if (!group) return;
  const sol = group.members[mIdx];
  if (!sol) return;
  state.selectedWords = [...state.selectedWords, ...sol];
  renderAll();
  scheduleFetch();
  scheduleCompleteFetch();
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateWord(word) {
  const inp  = document.getElementById('word-input');
  const pool = letterPool();
  const need = freq(word);
  const errors = [];
  for (const [c, n] of Object.entries(need)) {
    const avail = pool[c] || 0;
    if (avail < n) {
      errors.push(avail === 0
        ? `"${c}" not available`
        : `only ${avail} "${c}" available`);
    }
  }

  inp.classList.remove('input-error', 'input-warn');
  if (errors.length) {
    inp.classList.add('input-error');
    showMsg(errors.join('; '), 'error');
  } else {
    clearMsg();
  }
}

// ── Scheduling (debounce) ─────────────────────────────────────────────────────

function scheduleFetch() {
  clearTimeout(fetchTimer);
  const letters = getAvailableLetters();
  if (letters.length === 0) {
    state.generalCandidates = [];
    renderGeneralBox();
    return;
  }
  fetchTimer = setTimeout(() => {
    worker.postMessage({ type: 'candidates', letters });
  }, 250);
}

function scheduleCompleteFetch() {
  clearTimeout(completeTimer);
  const letters = getAvailableLetters();
  const listEl  = document.getElementById('complete-list');
  if (letters.length === 0) {
    listEl.innerHTML = '<div class="list-placeholder">No letters remaining</div>';
    document.getElementById('complete-count').textContent = '0';
    return;
  }
  listEl.innerHTML = '<div class="list-loading">Searching for complete solutions</div>';
  completeTimer = setTimeout(() => {
    worker.postMessage({
      type: 'complete',
      letters,
      bonus2: [...state.bonus2Set],
      bonus4: [...state.bonus4Set],
    });
  }, 400);
}

// ── Messaging ─────────────────────────────────────────────────────────────────

function showMsg(text, type) {
  const el = document.getElementById('word-msg');
  el.textContent = text;
  el.className   = `msg ${type}`;
}

function clearMsg() {
  const el = document.getElementById('word-msg');
  el.textContent = '';
  el.className   = 'msg';
  document.getElementById('word-input').classList.remove('input-error', 'input-warn');
}

function setStatus(text, cls) {
  const el = document.getElementById('status-bar');
  el.textContent = text;
  el.className   = cls || '';
}
