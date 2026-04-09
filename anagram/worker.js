/**
 * Web Worker: anagram search engine
 *
 * Receives messages of two kinds:
 *   { type: 'load', url }           — fetch and index the wordlist
 *   { type: 'candidates', letters } — find all words formable from letters[]
 *   { type: 'complete', letters, priority } — find complete anagrams
 *
 * Responds with:
 *   { type: 'loaded' }
 *   { type: 'candidates', candidates, common, total }
 *   { type: 'complete', solutions, timedOut }
 */

'use strict';

// ── Constants (mirror the Python app) ────────────────────────────────────────

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

const MAX_CANDIDATES = 500;
const COMPLETE_TIME_LIMIT_MS = 3000;
const MAX_SOLUTIONS = 200;

// ── State ─────────────────────────────────────────────────────────────────────

let wordlist = [];   // sorted array of words
let loaded   = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Count letter frequencies in an array or string of chars. */
function freq(letters) {
  const map = {};
  for (const c of letters) map[c] = (map[c] || 0) + 1;
  return map;
}

/** Return true if word can be formed from the pool freq map. */
function canForm(word, pool) {
  const need = freq(word);
  for (const [c, n] of Object.entries(need)) {
    if ((pool[c] || 0) < n) return false;
  }
  return true;
}

/** Subtract word's letters from pool, returning a new pool object. */
function subtract(pool, word) {
  const next = { ...pool };
  for (const c of word) next[c]--;
  return next;
}

/** Total letters remaining in pool. */
function poolSize(pool) {
  let n = 0;
  for (const v of Object.values(pool)) n += v;
  return n;
}

// ── Candidate search ──────────────────────────────────────────────────────────

function findCandidates(letters) {
  const pool = freq(letters);
  const candidates = [];
  const common     = [];

  for (const word of wordlist) {
    if (word.length > letters.length) continue;
    if (!canForm(word, pool)) continue;

    if (COMMON_WORDS.has(word)) common.push(word);
    else candidates.push(word);

    if (candidates.length >= MAX_CANDIDATES && common.length >= COMMON_WORDS.size) break;
  }

  // Sort longest-first; ties stay alphabetical (wordlist is pre-sorted)
  candidates.sort((a, b) => b.length - a.length);

  const total = candidates.length;
  return {
    candidates: candidates.slice(0, MAX_CANDIDATES),
    common,
    total,
  };
}

// ── Complete anagram search ───────────────────────────────────────────────────

/**
 * Backtracking search: find all multiword combinations that exactly exhaust
 * the available letters. Priority words are tried first.
 */
function findCompleteAnagrams(letters, priority) {
  const prioritySet = new Set(priority);
  const pool0  = freq(letters);
  const size0  = poolSize(pool0);
  const solutions = [];
  const deadline  = Date.now() + COMPLETE_TIME_LIMIT_MS;
  let   timedOut  = false;

  // Pre-filter wordlist to only words that can be formed from the full pool.
  // Sort priority words to the front.
  const usable = wordlist.filter(w => w.length <= size0 && canForm(w, pool0));
  usable.sort((a, b) => {
    const ap = prioritySet.has(a) ? 0 : 1;
    const bp = prioritySet.has(b) ? 0 : 1;
    return ap - bp || a.localeCompare(b);
  });

  function backtrack(pool, remaining, current) {
    if (solutions.length >= MAX_SOLUTIONS) return;
    if (Date.now() > deadline) { timedOut = true; return; }

    if (remaining === 0) {
      solutions.push([...current]);
      return;
    }

    for (const word of usable) {
      if (timedOut || solutions.length >= MAX_SOLUTIONS) return;
      if (word.length > remaining) continue;
      // Avoid duplicates: only allow words >= the last chosen word (lex order)
      if (current.length > 0 && word < current[current.length - 1]) continue;
      if (!canForm(word, pool)) continue;

      current.push(word);
      backtrack(subtract(pool, word), remaining - word.length, current);
      current.pop();
    }
  }

  backtrack(pool0, size0, []);

  // Sort solutions: compare descending-sorted word-length signatures.
  // e.g. [7,5,4,4,2] beats [6,6,5,5,1] because 7 > 6 at the first position.
  solutions.sort((a, b) => {
    const la = a.map(w => w.length).sort((x, y) => y - x);
    const lb = b.map(w => w.length).sort((x, y) => y - x);
    for (let i = 0; i < Math.min(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) return lb[i] - la[i];
    }
    return la.length - lb.length; // fewer words (longer each) wins ties
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
