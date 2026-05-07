/**
 * Web Worker: anagram search engine
 *
 * Messages in:
 *   { type: 'load', url }
 *   { type: 'candidates', letters }
 *   { type: 'complete', letters, bonus2, bonus4 }
 *
 * Messages out:
 *   { type: 'loaded', count }
 *   { type: 'candidates', candidates }    — all formable words, length desc
 *   { type: 'complete', solutions, timedOut, cappedKeys }
 *
 * Word scoring:
 *   score(w) = w.length
 *           + 4 if w in bonus4 (manual + game categories)
 *           + 2 if w in bonus2 (priority words bulk list)
 *           + 0 otherwise (common, dictionary)
 */

'use strict';

const COMPLETE_TIME_LIMIT_MS = 3000;
const MAX_SOLUTIONS = 300000;
const SCORE_THRESHOLD = 8;  // keep in sync with anagram.js
const HEADLINE_CAP    = 100; // max solutions stored per unique headline

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

function findCompleteAnagrams(letters, bonus2, bonus4) {
  const set2 = new Set(bonus2);
  const set4 = new Set(bonus4);
  const pool0  = freq(letters);
  const size0  = poolSize(pool0);
  const solutions = [];
  const deadline  = Date.now() + COMPLETE_TIME_LIMIT_MS;
  let   timedOut  = false;

  const scoreOf = w => w.length + (set4.has(w) ? 4 : set2.has(w) ? 2 : 0);

  const usable = wordlist.filter(w => w.length <= size0 && canForm(w, pool0));
  usable.sort((a, b) => scoreOf(b) - scoreOf(a) || a.localeCompare(b));

  // First index in usable where score drops below threshold — body words start here.
  // Once minIdx reaches this point the headline (set of high-score words chosen so
  // far) is frozen and we can apply a per-headline solution cap.
  let pivot = usable.findIndex(w => scoreOf(w) < SCORE_THRESHOLD);
  if (pivot === -1) pivot = usable.length;

  const headlineCounts = new Map(); // headline-key → solutions stored so far
  const cappedSet      = new Set(); // headline-keys that hit HEADLINE_CAP

  function hlKey(words) {
    const hl = words.filter(w => scoreOf(w) >= SCORE_THRESHOLD);
    hl.sort((a, b) => scoreOf(b) - scoreOf(a) || a.localeCompare(b));
    return hl.join('\0');
  }

  function backtrack(pool, remaining, current, minIdx, curHlKey) {
    if (solutions.length >= MAX_SOLUTIONS) return;
    if (Date.now() > deadline) { timedOut = true; return; }
    if (curHlKey !== null && cappedSet.has(curHlKey)) return;

    if (remaining === 0) {
      const key = curHlKey !== null ? curHlKey : hlKey(current);
      const cnt = (headlineCounts.get(key) || 0) + 1;
      headlineCounts.set(key, cnt);
      if (cnt > HEADLINE_CAP) { cappedSet.add(key); return; }
      solutions.push([...current]);
      return;
    }

    for (let i = minIdx; i < usable.length; i++) {
      if (timedOut || solutions.length >= MAX_SOLUTIONS) return;
      const word = usable[i];
      if (word.length > remaining) continue;
      if (!canForm(word, pool)) continue;

      // When we first step past the pivot, freeze the headline key.
      let childHlKey = curHlKey;
      if (childHlKey === null && i >= pivot) {
        childHlKey = hlKey(current); // word (below threshold) is not yet in current
      }
      if (childHlKey !== null && cappedSet.has(childHlKey)) continue;

      current.push(word);
      backtrack(subtract(pool, word), remaining - word.length, current, i, childHlKey);
      current.pop();
    }
  }

  backtrack(pool0, size0, [], 0, null);

  solutions.sort((a, b) => {
    const la = a.map(scoreOf).sort((x, y) => y - x);
    const lb = b.map(scoreOf).sort((x, y) => y - x);
    for (let i = 0; i < Math.min(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) return lb[i] - la[i];
    }
    return la.length - lb.length;
  });

  return { solutions, timedOut, cappedKeys: [...cappedSet] };
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async function (e) {
  const msg = e.data;

  if (msg.type === 'load') {
    try {
      const resp = await fetch(msg.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${msg.url}`);
      const text = await resp.text();
      wordlist = text
        .split('\n')
        .map(w => w.trim().toLowerCase())
        .filter(w => /^[a-z]+$/.test(w));
      wordlist.sort();
      loaded = true;
      self.postMessage({ type: 'loaded', count: wordlist.length });
    } catch (err) {
      self.postMessage({ type: 'error', message: 'Wordlist load failed: ' + (err && err.message || err) });
    }
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
    const result = findCompleteAnagrams(msg.letters, msg.bonus2 || [], msg.bonus4 || []);
    self.postMessage({ type: 'complete', ...result });
    return;
  }
};
