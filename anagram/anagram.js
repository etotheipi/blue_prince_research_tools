'use strict';

/**
 * Static anagrammer — no server required.
 *
 * All word searching runs in a Web Worker (worker.js) so the UI never freezes.
 * The wordlist (../../data/wordlist.json) and priority word defaults
 * (../../data/priority_words.json) are fetched once on load and cached by
 * the browser.
 *
 * Path assumptions (when served as part of the multi-tab shell):
 *   anagram/index.html  → loads anagram/anagram.js
 *   data/wordlist.json
 *   data/priority_words.json
 *
 * When opened as a standalone file for development, adjust DATA_ROOT below.
 */

// ── Config ────────────────────────────────────────────────────────────────────

// Relative path from this JS file to the data/ directory.
// Works whether this page is served as /anagram/ from the root or standalone.
const DATA_ROOT = '../data';

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
  baseInput:     '',
  baseLetters:   [],
  selectedWords: [],
  priorityList:  [],        // ordered array (for display)
  priorityWords: new Set(), // O(1) lookup
  lastSolutions: [],
};

// Pending timer IDs for debouncing worker requests
let fetchTimer    = null;
let completeTimer = null;

// Simple in-browser word set for immediate validation (loaded from wordlist)
let wordSet = null; // Set<string>, populated once worker loads

// ── Boot ──────────────────────────────────────────────────────────────────────

setStatus('Loading wordlist…', 'loading');

// Resolve absolute URL for the worker so it can fetch the wordlist
const wordlistUrl = new URL(`${DATA_ROOT}/wordlist.json`, window.location.href).href;
worker.postMessage({ type: 'load', url: wordlistUrl });

// ── Worker callbacks ──────────────────────────────────────────────────────────

function onWorkerLoaded({ count }) {
  setStatus(`Ready — ${count.toLocaleString()} words loaded`, 'ready');
  document.getElementById('base-input').disabled = false;

  // Also build a local Set for instant validation feedback
  fetch(`${DATA_ROOT}/wordlist.json`)
    .then(r => r.json())
    .then(list => { wordSet = new Set(list); })
    .catch(() => {}); // non-fatal — validation just won't flag unknown words

  // Load default priority words
  fetch(`${DATA_ROOT}/priority_words.json`)
    .then(r => r.json())
    .then(words => {
      if (!Array.isArray(words) || words.length === 0) return;
      state.priorityList  = words.map(w => w.toLowerCase());
      state.priorityWords = new Set(state.priorityList);
      renderPriorityList();
    })
    .catch(() => {}); // non-fatal
}

function onCandidates({ candidates, common, total }) {
  renderCandidates(candidates, common, total);
}

function onComplete({ solutions, timedOut }) {
  renderCompleteAnagrams(solutions, timedOut);
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('base-input').addEventListener('input', function () {
  state.baseInput    = this.value;
  state.baseLetters  = [...this.value.toLowerCase()].filter(c => /[a-z]/.test(c));
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
  const pool = freq(state.baseLetters);
  for (const word of state.selectedWords) {
    for (const c of word) { if (pool[c] > 0) pool[c]--; }
  }
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
  renderPriorityList();
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

function renderPriorityList() {
  const listEl  = document.getElementById('priority-list');
  const countEl = document.getElementById('priority-count');
  countEl.textContent = state.priorityList.length;

  if (state.priorityList.length === 0) {
    listEl.innerHTML = '<div class="list-placeholder">No priority words yet</div>';
    return;
  }

  const pool    = letterPool();
  const avail   = state.priorityList.filter(w =>  canFormFromPool(w, pool));
  const unavail = state.priorityList.filter(w => !canFormFromPool(w, pool));

  const removeBtn = w =>
    `<button class="pri-remove" onclick="event.stopPropagation();removePriorityWord('${w}')" title="Remove">✕</button>`;

  let html = avail.map(w =>
    `<div class="list-item pri-avail" onclick="addWord('${w}')">${w}${removeBtn(w)}</div>`
  ).join('');

  if (avail.length && unavail.length) {
    html += `<div class="list-divider">Not available</div>`;
  }

  html += unavail.map(w =>
    `<div class="list-item pri-unavail">${w}${removeBtn(w)}</div>`
  ).join('');

  listEl.innerHTML = html;
}

function renderCandidates(candidates, common, total) {
  const listEl  = document.getElementById('candidates-list');
  const countEl = document.getElementById('cand-count');

  if (!candidates || candidates.length === 0) {
    listEl.innerHTML = '<div class="list-placeholder">No words found</div>';
    countEl.textContent = '0';
  } else {
    const showing = candidates.length;
    countEl.textContent = total > showing ? `${showing} of ${total}` : `${total}`;

    const pri  = candidates.filter(w =>  state.priorityWords.has(w));
    const rest = candidates.filter(w => !state.priorityWords.has(w));

    const makeItem = (w, extraClass) =>
      `<div class="list-item cand${extraClass}" data-word="${w}" onclick="addWord('${w}')">${w}<span class="item-len">${w.length}</span></div>`;

    let html = pri.map(w => makeItem(w, ' hi')).join('');
    if (pri.length && rest.length) html += `<div class="list-divider">All candidates</div>`;
    html += rest.map(w => makeItem(w, '')).join('');
    listEl.innerHTML = html;
  }

  const commonEl    = document.getElementById('common-list');
  const commonCount = document.getElementById('common-count');

  if (!common || common.length === 0) {
    commonEl.innerHTML = '<div class="list-placeholder">None available</div>';
    commonCount.textContent = '0';
  } else {
    commonCount.textContent = common.length;
    commonEl.innerHTML = common.map(w =>
      `<div class="list-item common${state.priorityWords.has(w) ? ' hi' : ''}" data-word="${w}" onclick="addWord('${w}')">${w}</div>`
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
    if (state.priorityWords.has(word)) continue;
    state.priorityList.push(word);
    state.priorityWords.add(word);
    added = true;
  }
  if (added) { renderPriorityList(); reHighlightLists(); }
}

function removePriorityWord(word) {
  state.priorityList  = state.priorityList.filter(w => w !== word);
  state.priorityWords.delete(word);
  renderPriorityList();
  reHighlightLists();
}

function reHighlightLists() {
  document.querySelectorAll('#candidates-list .list-item[data-word]').forEach(el => {
    el.classList.toggle('hi', state.priorityWords.has(el.dataset.word));
  });
  document.querySelectorAll('#common-list .list-item[data-word]').forEach(el => {
    el.classList.toggle('hi', state.priorityWords.has(el.dataset.word));
  });
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
  // Instant client-side validation once wordSet is available
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
  } else if (wordSet && !wordSet.has(word)) {
    inp.classList.add('input-warn');
    showMsg(`"${word}" not in dictionary — you can still add it`, 'warn');
  } else {
    clearMsg();
  }
}

// ── Scheduling (debounce) ─────────────────────────────────────────────────────

function scheduleFetch() {
  clearTimeout(fetchTimer);
  const letters = getAvailableLetters();
  if (letters.length === 0) {
    document.getElementById('candidates-list').innerHTML = '<div class="list-placeholder">No letters remaining</div>';
    document.getElementById('common-list').innerHTML     = '<div class="list-placeholder">No letters remaining</div>';
    document.getElementById('cand-count').textContent   = '0';
    document.getElementById('common-count').textContent = '0';
    return;
  }
  document.getElementById('candidates-list').innerHTML = '<div class="list-loading">Finding candidates</div>';
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
