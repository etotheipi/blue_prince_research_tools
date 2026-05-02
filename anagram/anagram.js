'use strict';

const DATA_ROOT = '../data';

// ── Common words (buttons, not scroll list) ───────────────────────────────────

const COMMON_WORDS = new Set([
  'a','an','the','in','on','at','to','for','of','and','or',
  'but','is','are','was','were','be','been','it','its',
  'that','this','these','those','with','by','from','as','not',
  'so','if','up','out','into','than','then','now','just',
  'we','he','she','they','you','i','my','me','us','him','her',
  'our','their','no','do','did','has','had','have','can',
  'will','would','could','should','may','all','new','get','let',
  'one','two','three','am','oh','ah','yet','too','also',
  'about','after','before','between','over','under',
  'again','still','even','only','both','each','every','some',
  'any','few','more','most','other','own','same','such',
  'what','which','who','when','where','why','how',
  'here','there','back','down','off','away','very','well',
  'four','five','six','seven','eight','nine','ten','eleven','twelve',
]);

// ── Category file definitions (order = grid display order) ────────────────────

const CATEGORY_FILES = [
  { key: 'angels',         label: 'Angels' },
  { key: 'constellations', label: 'Constellations' },
  { key: 'erajan',         label: 'Erajan' },
  { key: 'items',          label: 'Items' },
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
};

worker.onerror = function (err) {
  setStatus('Worker error: ' + err.message, 'error');
};

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  baseInput:         '',
  baseLetters:       [],
  selectedWords:     [],
  categories:        [],   // [{key, label, words: Set, sortedList: string[]}]
  priorityList:      [],   // priority_words.json minus category words, minus COMMON_WORDS
  priorityWords:     new Set(), // full union of all categories + priorityList (for scoring)
  generalCandidates: [],   // formable words not in any priority/common set
  lastSolutions:     [],
};

let fetchTimer    = null;
let completeTimer = null;

// ── Boot ──────────────────────────────────────────────────────────────────────

setStatus('Loading wordlist…', 'loading');

const wordlistUrl = new URL(`${DATA_ROOT}/wordlist.json`, window.location.href).href;
worker.postMessage({ type: 'load', url: wordlistUrl });

// ── Worker callbacks ──────────────────────────────────────────────────────────

function onWorkerLoaded({ count }) {
  setStatus(`Ready — ${count.toLocaleString()} words loaded`, 'ready');
  document.getElementById('base-input').disabled = false;

  const fetchText = url => fetch(url).then(r => r.ok ? r.text() : '').catch(() => '');
  const fetchJson = url => fetch(url).then(r => r.ok ? r.json() : []).catch(() => []);

  const catUrls = CATEGORY_FILES.map(c =>
    fetchText(new URL(`${DATA_ROOT}/anagram_cateogries/${c.key}.txt`, window.location.href).href)
  );

  Promise.all([
    ...catUrls,
    fetchJson(new URL(`${DATA_ROOT}/priority_words.json`, window.location.href).href),
  ]).then(results => {
    const catTexts   = results.slice(0, CATEGORY_FILES.length);
    const priorityJson = results[CATEGORY_FILES.length];

    // Build category sets
    state.categories = CATEGORY_FILES.map((def, i) => {
      const words = processTextList(catTexts[i]);
      return { key: def.key, label: def.label, words: new Set(words), sortedList: words };
    });

    // All category words combined
    const allCatWords = new Set();
    for (const cat of state.categories) {
      for (const w of cat.words) allCatWords.add(w);
    }

    // Priority words: remove category overlaps and COMMON_WORDS
    const rawPriority = Array.isArray(priorityJson)
      ? priorityJson.map(w => w.toLowerCase().trim()).filter(w => /^[a-z]{2,}$/.test(w))
      : [];
    state.priorityList = rawPriority.filter(w => !allCatWords.has(w) && !COMMON_WORDS.has(w));

    // Full priority union for worker scoring
    state.priorityWords = new Set([...allCatWords, ...state.priorityList]);

    renderAll();
    scheduleFetch();
    scheduleCompleteFetch();
  });
}

function onCandidates({ candidates }) {
  // Filter out common words and any priority words — those are in their own boxes
  state.generalCandidates = candidates.filter(
    w => !COMMON_WORDS.has(w) && !state.priorityWords.has(w)
  );
  renderGeneralBox();
}

function onComplete({ solutions, timedOut }) {
  renderCompleteAnagrams(solutions, timedOut);
}

// ── Normalization ─────────────────────────────────────────────────────────────

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

document.getElementById('priority-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addPriorityWord();
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
        `<div class="box-item" onclick="addWord('${w.replace(/'/g, "\\'")}')">${w}<span class="item-len">${w.length}</span></div>`
      ).join('');
    }
  }

  // Priority words box
  const priBody  = document.getElementById('box-priority');
  const priCount = document.getElementById('cnt-priority');
  if (priBody) {
    const avail = state.priorityList.filter(w => canFormFromPool(w, pool));
    avail.sort((a, b) => b.length - a.length);
    priCount.textContent = avail.length;

    if (avail.length === 0) {
      priBody.innerHTML = '<div class="box-placeholder">—</div>';
    } else {
      const removeBtn = w =>
        `<button class="pri-remove" onclick="event.stopPropagation();removePriorityWord('${w.replace(/'/g, "\\'")}')" title="Remove">✕</button>`;
      priBody.innerHTML = avail.map(w =>
        `<div class="box-item" onclick="addWord('${w.replace(/'/g, "\\'")}')">${w}<span class="item-len">${w.length}</span>${removeBtn(w)}</div>`
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
      `<div class="box-item" onclick="addWord('${w.replace(/'/g, "\\'")}')">${w}<span class="item-len">${w.length}</span></div>`
    ).join('');
  }
}

function renderCompleteAnagrams(solutions, timedOut) {
  const listEl  = document.getElementById('complete-list');
  const countEl = document.getElementById('complete-count');
  const selected = state.selectedWords;

  if (!solutions || solutions.length === 0) {
    listEl.innerHTML = '<div class="list-placeholder">No complete solutions found</div>';
    countEl.textContent = '0';
    return;
  }

  countEl.textContent = solutions.length + (timedOut ? '+' : '');
  state.lastSolutions = solutions;

  const html = solutions.map((sol, idx) => {
    const fullWords = [...selected, ...sol];
    const wordPills = fullWords.map((w, i) => {
      const isPriority = state.priorityWords.has(w);
      const isSelected = i < selected.length;
      const cls = isSelected
        ? 'sol-word sol-selected-word'
        : isPriority ? 'sol-word sol-priority' : 'sol-word';
      return `<span class="${cls}">${w}</span>`;
    }).join('');
    return `<div class="solution-item" onclick="selectSolution(${idx})" data-idx="${idx}">
      <div class="solution-words">${wordPills}</div>
    </div>`;
  }).join('');

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

function addPriorityWord() {
  const inp  = document.getElementById('priority-input');
  const raw  = inp.value;
  inp.value  = '';
  const words = raw.split(/[\s,]+/).map(w => w.trim().toLowerCase()).filter(w => w && /^[a-z]+$/.test(w));
  let added = false;
  for (const word of words) {
    if (state.priorityWords.has(word) || COMMON_WORDS.has(word)) continue;
    state.priorityList.push(word);
    state.priorityWords.add(word);
    added = true;
  }
  if (added) renderAll();
}

function removePriorityWord(word) {
  state.priorityList = state.priorityList.filter(w => w !== word);
  // Only remove from priorityWords if not also in a category
  const inCategory = state.categories.some(cat => cat.words.has(word));
  if (!inCategory) state.priorityWords.delete(word);
  renderAll();
}

function selectSolution(idx) {
  if (!state.lastSolutions || !state.lastSolutions[idx]) return;
  state.selectedWords = [...state.selectedWords, ...state.lastSolutions[idx]];
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
    worker.postMessage({ type: 'complete', letters, priority: [...state.priorityWords] });
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
