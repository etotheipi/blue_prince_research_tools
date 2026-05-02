/**
 * Web Worker: anagram search engine
 *
 * Messages in:
 *   { type: 'load', url }
 *   { type: 'candidates', letters }
 *   { type: 'complete', letters, priority }
 *
 * Messages out:
 *   { type: 'loaded', count }
 *   { type: 'candidates', candidates }   — all formable words, length desc
 *   { type: 'complete', solutions, timedOut }
 */

'use strict';

const COMPLETE_TIME_LIMIT_MS = 3000;
const MAX_SOLUTIONS = 1000;

let wordlist = [];
let loaded   = false;

function freq(letters) {
  const map = {};
  for (const c of letters) map[c] = (map[c] || 0) + 1;
  return map;
}

function canForm(word, pool) {
  const need = freq(word);
  for (const [c, n] of Object.entries(need)) {
    if ((pool[c] || 0) < n) return false;
  }
  return true;
}

function subtract(pool, word) {
  const next = { ...pool };
  for (const c of word) next[c]--;
  return next;
}

function poolSize(pool) {
  let n = 0;
  for (const v of Object.values(pool)) n += v;
  return n;
}

// ── Candidate search ──────────────────────────────────────────────────────────

function findCandidates(letters) {
  const pool = freq(letters);
  const candidates = [];
  for (const word of wordlist) {
    if (word.length > letters.length) continue;
    if (!canForm(word, pool)) continue;
    candidates.push(word);
  }
  candidates.sort((a, b) => b.length - a.length);
  return { candidates };
}

// ── Complete anagram search ───────────────────────────────────────────────────

function findCompleteAnagrams(letters, priority) {
  const prioritySet = new Set(priority);
  const pool0  = freq(letters);
  const size0  = poolSize(pool0);
  const solutions = [];
  const deadline  = Date.now() + COMPLETE_TIME_LIMIT_MS;
  let   timedOut  = false;

  const scoreOf = w => w.length + (prioritySet.has(w) ? 3 : 0);

  // Sort highest-scoring (longest / priority) words first so the backtracking
  // reaches solutions containing long or priority words as early as possible.
  const usable = wordlist.filter(w => w.length <= size0 && canForm(w, pool0));
  usable.sort((a, b) => scoreOf(b) - scoreOf(a) || a.localeCompare(b));

  // Deduplication via index constraint: each next word's index must be >= the
  // current word's index. This gives one canonical ordering per multi-set of
  // words (descending-score order) and guarantees no duplicate solutions.
  function backtrack(pool, remaining, current, minIdx) {
    if (solutions.length >= MAX_SOLUTIONS) return;
    if (Date.now() > deadline) { timedOut = true; return; }

    if (remaining === 0) {
      solutions.push([...current]);
      return;
    }

    for (let i = minIdx; i < usable.length; i++) {
      if (timedOut || solutions.length >= MAX_SOLUTIONS) return;
      const word = usable[i];
      if (word.length > remaining) continue;
      if (!canForm(word, pool)) continue;
      current.push(word);
      backtrack(subtract(pool, word), remaining - word.length, current, i);
      current.pop();
    }
  }

  backtrack(pool0, size0, [], 0);

  const score = w => w.length + (prioritySet.has(w) ? 3 : 0);
  solutions.sort((a, b) => {
    const la = a.map(score).sort((x, y) => y - x);
    const lb = b.map(score).sort((x, y) => y - x);
    for (let i = 0; i < Math.min(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) return lb[i] - la[i];
    }
    return la.length - lb.length;
  });

  return { solutions, timedOut };
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async function (e) {
  const msg = e.data;

  if (msg.type === 'load') {
    const resp = await fetch(msg.url);
    wordlist = await resp.json();
    loaded = true;
    self.postMessage({ type: 'loaded', count: wordlist.length });
    return;
  }

  if (!loaded) {
    self.postMessage({ type: 'error', message: 'Wordlist not loaded yet' });
    return;
  }

  if (msg.type === 'candidates') {
    const result = findCandidates(msg.letters);
    self.postMessage({ type: 'candidates', ...result });
    return;
  }

  if (msg.type === 'complete') {
    const result = findCompleteAnagrams(msg.letters, msg.priority || []);
    self.postMessage({ type: 'complete', ...result });
    return;
  }
};
