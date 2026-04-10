'use strict';

/**
 * tab-tools.js — Calculators tab
 *
 * Exposes: initToolsTab(container)
 *
 * Calculators:
 *   1. Numeric Core  — Blue Prince game mechanic: 4 numbers, 3 ops (-, *, /), find min ≥ 0
 *   2. Periodic Table Lookup — search by symbol, name, or atomic number
 *   3. Day of Week Calc      — start day + offset → result day
 *   4. Number ↔ Letters      — A=1 … Z=26 mappings
 */

// ── Periodic table data ───────────────────────────────────────────────────────

let elementsData = null;

async function loadElements() {
  if (elementsData) return elementsData;
  const resp = await fetch('data/elements.json');
  elementsData = await resp.json();
  return elementsData;
}

// ── 1. Numeric Core (Blue Prince) ────────────────────────────────────────────
//
// Algorithm: given [a, b, c, d], try all 6 permutations of {-, *, /} as
// op1, op2, op3, evaluate ((a op1 b) op2 c) op3 d, and return the smallest
// non-negative whole number result.
//
// Input formats:
//   "1,2,3,4"  → single 4-number input
//   "1234"     → 4 single digits
//   "12345"    → 4 splits (one pair + three singles), take best
//   "BLUE"     → 4 letters → A=1…Z=26
//   Multi-value: space/comma/newline separated list of any of the above.

const _OPS = ['-', '*', '/'];
const _OP_PERMS = (() => {
  const p = [];
  for (const a of _OPS) for (const b of _OPS) for (const c of _OPS)
    if (a !== b && b !== c && a !== c) p.push([a, b, c]);
  return p; // 6 permutations
})();

function _applyOp(a, op, b) {
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') return b === 0 ? null : a / b;
}

function _isWholeNum(x) {
  return Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9;
}

/**
 * Core computation on exactly [a, b, c, d].
 * Returns { core: number|null, expression: string|null }
 */
function computeCore(nums) {
  let minCore = null;
  let bestExpr = null;

  for (const [op1, op2, op3] of _OP_PERMS) {
    const s1 = _applyOp(nums[0], op1, nums[1]);
    if (s1 === null) continue;
    const s2 = _applyOp(s1, op2, nums[2]);
    if (s2 === null) continue;
    const s3 = _applyOp(s2, op3, nums[3]);
    if (s3 === null || !_isWholeNum(s3)) continue;

    const iv = Math.round(s3);
    if (iv < 0) continue; // negatives not valid (0 IS valid — Python bug fix)

    if (minCore === null || iv < minCore) {
      minCore = iv;
      bestExpr = `((${nums[0]} ${op1} ${nums[1]}) ${op2} ${nums[2]}) ${op3} ${nums[3]}`;
    }
  }

  return { core: minCore, expression: bestExpr };
}

function _lettersToNums(s) {
  return [...s.toLowerCase()].map(c => c.charCodeAt(0) - 96); // a=1…z=26
}

function _splitFiveDigits(s) {
  return [
    [+s.slice(0,2), +s[2], +s[3], +s[4]],
    [+s[0], +s.slice(1,3), +s[3], +s[4]],
    [+s[0], +s[1], +s.slice(2,4), +s[4]],
    [+s[0], +s[1], +s[2], +s.slice(3,5)],
  ];
}

/**
 * Parse a single token into { label, candidates: [[nums]], letterNums?, is5digit? }
 * or { error: string }.
 *
 * Supported formats:
 *   [1000, 200, 11, 2]  — bracketed 4-number list (any integers, spaces optional)
 *   1234                — exactly 4 digits → 4 single-digit inputs
 *   12345               — exactly 5 digits → tries all 4 two-digit splits
 *   BLUE                — exactly 4 letters → A=1…Z=26
 */
function parseCoreToken(token) {
  token = token.trim();
  if (!token) return null;

  // Bracketed 4-number list: [1000, 200, 11, 2]
  const bracketMatch = token.match(/^\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]$/);
  if (bracketMatch) {
    const nums = bracketMatch.slice(1).map(Number);
    return { label: `[${nums.join(', ')}]`, candidates: [nums] };
  }

  // Exactly 4 digits
  if (/^\d{4}$/.test(token)) {
    return { label: token, candidates: [[...token].map(Number)] };
  }

  // Exactly 5 digits — try all 4 splits, take min core
  if (/^\d{5}$/.test(token)) {
    return { label: token, candidates: _splitFiveDigits(token), is5digit: true };
  }

  // Exactly 4 letters
  if (/^[a-zA-Z]{4}$/.test(token)) {
    const nums = _lettersToNums(token);
    return { label: token.toUpperCase(), candidates: [nums], letterNums: nums };
  }

  return { error: `"${token}" — unrecognised format` };
}

/**
 * Parse free-form multi-value input.
 * Bracketed lists [a,b,c,d] are extracted first, then the remainder is
 * split on whitespace/commas into individual tokens.
 */
function parseMultiInput(raw) {
  const results = [];
  // Pull out all bracketed groups first
  const bracketRe = /\[\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+\s*\]/g;
  const brackets = [];
  const stripped = raw.replace(bracketRe, m => { brackets.push(m); return ' '; });

  for (const b of brackets) {
    const p = parseCoreToken(b);
    if (p) results.push(p);
  }

  // Split remaining text on whitespace, commas, newlines
  for (const tok of stripped.split(/[\s,\n]+/).filter(Boolean)) {
    const p = parseCoreToken(tok);
    if (p) results.push(p);
  }

  return results;
}

/**
 * Run core on all candidates and return the best (minimum non-negative) result.
 * For 5-digit inputs, also record which split won.
 */
function evalCoreToken(parsed) {
  if (parsed.error) return { label: parsed.error, core: null, expression: null, parseError: true };

  let bestCore = null;
  let bestExpr = null;
  let bestNums = null;

  for (const nums of parsed.candidates) {
    const { core, expression } = computeCore(nums);
    if (core !== null && (bestCore === null || core < bestCore)) {
      bestCore = core;
      bestExpr = expression;
      bestNums = nums;
    }
  }

  return {
    label:      parsed.label,
    core:       bestCore,
    expression: bestExpr,
    letterNums: parsed.letterNums,
    splitUsed:  parsed.is5digit && bestNums ? bestNums : null,
  };
}

/** Format a result row for display. Returns { coreText, badge, exprText, needsFlag } */
function formatCoreRow(result) {
  if (result.parseError) {
    return { coreText: '?', badge: result.label, exprText: '', needsFlag: false, nocore: false };
  }

  if (result.core === null) {
    return { coreText: 'no core', badge: '', exprText: '', needsFlag: false, nocore: true };
  }

  const c = result.core;
  let badge = '';
  let needsFlag = false;
  let exprText = result.expression ? `${result.expression} = ${c}` : '';

  if (c >= 1 && c <= 26) {
    badge = String.fromCharCode(64 + c); // A=1…Z=26
  }
  if (c > 999) {
    needsFlag = true;
  }
  if (result.splitUsed) {
    const sf = `split [${result.splitUsed.join(', ')}]`;
    exprText = exprText ? `${sf} · ${exprText}` : sf;
  }
  if (result.letterNums) {
    const ln = [...result.label].map((ch, i) => `${ch}=${result.letterNums[i]}`).join(', ');
    exprText = exprText ? `${ln} · ${exprText}` : ln;
  }

  return { coreText: String(c), badge, exprText, needsFlag, nocore: false };
}

function renderNumericCore(container) {
  const textarea = container.querySelector('#nc-input');
  const btn      = container.querySelector('#nc-btn');
  const output   = container.querySelector('#nc-output');

  function run() {
    const raw = textarea.value.trim();
    if (!raw) { output.innerHTML = ''; return; }

    const parsed  = parseMultiInput(raw);
    const results = parsed.map(evalCoreToken);

    if (!results.length) { output.innerHTML = '<div class="nc-empty">No valid inputs found.</div>'; return; }

    const rows = results.map(result => {
      const { coreText, badge, exprText, needsFlag, nocore, parseError } = formatCoreRow(result);

      const labelClass = parseError ? 'nc-label nc-parse-err' : 'nc-label';
      const coreClass  = nocore ? 'nc-core nc-nocore' : needsFlag ? 'nc-core nc-flag' : 'nc-core';
      const flagMark   = needsFlag ? ' <span class="nc-asterisk" title="Result ≥ 1000 — apply core again">*</span>' : '';
      const badgeHtml  = badge ? ` <span class="nc-badge">${badge}</span>` : '';
      const warnHtml   = needsFlag
        ? `<div class="nc-warn">⚠ Result ≥ 1000 — apply core algorithm again to get final answer</div>`
        : '';
      const exprHtml   = exprText
        ? `<div class="nc-expr">${escHtml(exprText)}</div>`
        : '';

      return `<div class="nc-row">
        <span class="${labelClass}">${escHtml(result.label)}</span>
        <span class="nc-arrow">→</span>
        <span class="${coreClass}">${escHtml(coreText)}${flagMark}${badgeHtml}</span>
        ${warnHtml}${exprHtml}
      </div>`;
    }).join('');

    output.innerHTML = rows;
  }

  function runAndClear() {
    run();
    textarea.value = '';
    textarea.focus();
  }

  btn.addEventListener('click', run);
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      runAndClear();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── 2. Element / Periodic Table Tool ─────────────────────────────────────────
//
// Two modes, auto-detected:
//
//   WORD MODE  (no delimiters): find all ways to split the word into element
//              symbols (1-2 chars, elements 1-111).
//              e.g. "Simon" → Si-Mo-N (14-42-7) and S-I-Mo-N (16-53-42-7)
//
//   LIST MODE  (contains comma, space, or hyphen): treat each token as a
//              symbol or atomic number and convert between the two.
//              e.g. "1,2,3,4" → H-He-Li-Be
//              e.g. "Si-Mo-N" → 14-42-7

let _elemMap = null; // { byNum, bySym } — built once after load

async function getElemMap() {
  if (_elemMap) return _elemMap;
  const all = await loadElements();
  const els = all.filter(e => e.n <= 111);
  const byNum = {};
  const bySym = {};
  for (const el of els) {
    byNum[el.n] = el;
    bySym[el.s.toLowerCase()] = el;
  }
  _elemMap = { byNum, bySym, els };
  return _elemMap;
}

/** Backtracking: find all ways to split `word` into element symbols. */
function findElementEncodings(word, bySym) {
  const lower   = word.toLowerCase();
  const results = [];

  function bt(pos, current) {
    if (results.length >= 30) return;
    if (pos === lower.length) { results.push([...current]); return; }

    // Try 2-char first (prefer longer matches = fewer, more interesting results)
    if (pos + 2 <= lower.length) {
      const s2 = lower.slice(pos, pos + 2);
      if (bySym[s2]) { current.push(bySym[s2]); bt(pos + 2, current); current.pop(); }
    }
    // Try 1-char
    if (pos + 1 <= lower.length) {
      const s1 = lower.slice(pos, pos + 1);
      if (bySym[s1]) { current.push(bySym[s1]); bt(pos + 1, current); current.pop(); }
    }
  }

  bt(0, []);
  return results;
}

/** Render one element encoding result row. */
function fmtEncoding(els) {
  const syms = els.map(e => e.s).join('-');
  const nums = els.map(e => e.n).join('-');
  return `<div class="pt-enc-row">
    <span class="pt-enc-nums">${escHtml(nums)}</span>
    <span class="pt-enc-syms">(${escHtml(syms)})</span>
  </div>`;
}

function renderElementTool(container) {
  const input  = container.querySelector('#pt-input');
  const output = container.querySelector('#pt-output');

  async function run() {
    const raw = input.value.trim();
    if (!raw) { output.innerHTML = ''; return; }

    const { byNum, bySym } = await getElemMap();

    // ── Detect mode ────────────────────────────────────────────────────────
    // LIST mode: contains commas, spaces, or hyphens between tokens
    const hasSeparators = /[,\s-]/.test(raw);

    if (hasSeparators) {
      // Split on commas, spaces, or hyphens
      const tokens = raw.split(/[\s,\-]+/).filter(Boolean);
      const rows = tokens.map(tok => {
        const asNum = /^\d+$/.test(tok) ? parseInt(tok, 10) : NaN;
        const el = !isNaN(asNum) ? byNum[asNum] : bySym[tok.toLowerCase()];
        if (!el) return { tok, el: null };
        return { tok, el };
      });

      const syms  = rows.map(r => r.el ? r.el.s  : `[${r.tok}?]`).join(' - ');
      const nums  = rows.map(r => r.el ? String(r.el.n) : `[${r.tok}?]`).join(' - ');
      const names = rows.map(r => r.el ? r.el.nm : `[${r.tok}?]`).join(', ');

      output.innerHTML = `
        <div class="pt-list-result">
          <div class="pt-list-row"><span class="pt-list-label">Symbols</span><span class="pt-list-val">${escHtml(syms)}</span></div>
          <div class="pt-list-row"><span class="pt-list-label">Numbers</span><span class="pt-list-val">${escHtml(nums)}</span></div>
          <div class="pt-list-row pt-list-names"><span class="pt-list-label">Names</span><span class="pt-list-val">${escHtml(names)}</span></div>
        </div>`;
      return;
    }

    // ── WORD mode ──────────────────────────────────────────────────────────
    const word    = raw.replace(/\s+/g, '');
    const encList = findElementEncodings(word, bySym);

    if (encList.length === 0) {
      output.innerHTML = `<div class="pt-no-enc">No valid element encodings for <strong>${escHtml(word)}</strong></div>`;
      return;
    }

    const limited = encList.length > 20;
    const shown   = encList.slice(0, 20);
    output.innerHTML =
      `<div class="pt-enc-label">${shown.length}${limited ? '+' : ''} encoding${shown.length === 1 ? '' : 's'} for <strong>${escHtml(word)}</strong></div>` +
      shown.map(fmtEncoding).join('') +
      (limited ? `<div class="pt-enc-more">Showing first 20…</div>` : '');
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

// ── 3. Day / Date Calculator (Blue Prince calendar) ───────────────────────────
//
// In-game: Day 1 = Saturday, Nov 7, 1993
// IRL:     Nov 7, 1993 = Sunday
// So in-game DOW = IRL DOW shifted back by 1 day.

const DAYS      = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS_S  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_L  = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];

// Game epoch in UTC — Nov 7, 1993
const GAME_EPOCH = Date.UTC(1993, 10, 7); // month is 0-indexed

/** UTC date (midnight) → in-game day number (Day 1 = Nov 7 1993) */
function dateToGameDay(utcMs) {
  return Math.round((utcMs - GAME_EPOCH) / 86400000) + 1;
}

/** Game day number → UTC ms */
function gameDayToDate(dayNum) {
  return GAME_EPOCH + (dayNum - 1) * 86400000;
}

/** UTC ms → in-game DOW string (shifted back 1 from IRL) */
function utcToGameDow(utcMs) {
  const irlDow = new Date(utcMs).getUTCDay(); // 0=Sun
  return DAYS[(irlDow - 1 + 7) % 7];
}

/** Format UTC ms as "Mon DD, YYYY" */
function fmtDate(utcMs) {
  const d = new Date(utcMs);
  return `${MONTHS_S[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * Parse a user date string into UTC ms, or null on failure.
 * Tries (in order):
 *   - plain integer                     → game day number
 *   - YYYY-MM-DD
 *   - M/D/YYYY or M/D/YY
 *   - MM-DD-YYYY or MM-DD-YY
 *   - D-Mon-YYYY  (31-Oct-1994)
 *   - Mon D, YYYY (Oct 31, 1994)
 *   - Mon YYYY    (just month + year → 1st of month)
 *   - native Date parse as last resort
 * Returns { utcMs, isDayNum } or null.
 */
function parseDateInput(raw) {
  raw = raw.trim();
  if (!raw) return null;

  // Plain integer → game day number
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= 1) return { utcMs: gameDayToDate(n), isDayNum: true, dayNum: n };
    return null;
  }

  const mon = (s) => {
    const idx = MONTHS_S.findIndex(m => m.toLowerCase() === s.slice(0,3).toLowerCase());
    return idx; // 0-11, or -1
  };
  const yr = (s) => {
    let y = parseInt(s, 10);
    if (y < 100) y += y < 30 ? 2000 : 1900;
    return y;
  };

  let m;

  // YYYY-MM-DD
  if ((m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return { utcMs: Date.UTC(+m[1], +m[2]-1, +m[3]) };
  }
  // M/D/YYYY or M/D/YY
  if ((m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    return { utcMs: Date.UTC(yr(m[3]), +m[1]-1, +m[2]) };
  }
  // MM-DD-YYYY or MM-DD-YY (numeric month, not Mon-name)
  if ((m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/))) {
    return { utcMs: Date.UTC(yr(m[3]), +m[1]-1, +m[2]) };
  }
  // D-Mon-YYYY  e.g. 31-Oct-1994
  if ((m = raw.match(/^(\d{1,2})-([a-zA-Z]+)-(\d{2,4})$/))) {
    const mi = mon(m[2]);
    if (mi >= 0) return { utcMs: Date.UTC(yr(m[3]), mi, +m[1]) };
  }
  // Mon-D-YYYY  e.g. Oct-31-1994
  if ((m = raw.match(/^([a-zA-Z]+)-(\d{1,2})-(\d{2,4})$/))) {
    const mi = mon(m[1]);
    if (mi >= 0) return { utcMs: Date.UTC(yr(m[3]), mi, +m[2]) };
  }
  // Mon D, YYYY  e.g. Oct 31, 1994  or  October 31, 1994
  if ((m = raw.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{2,4})$/))) {
    const mi = mon(m[1]);
    if (mi >= 0) return { utcMs: Date.UTC(yr(m[3]), mi, +m[2]) };
  }
  // D Mon YYYY  e.g. 31 Oct 1994
  if ((m = raw.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{2,4})$/))) {
    const mi = mon(m[2]);
    if (mi >= 0) return { utcMs: Date.UTC(yr(m[3]), mi, +m[1]) };
  }

  // Native parse fallback (treat as local noon to avoid timezone-crossing)
  const nd = new Date(raw);
  if (!isNaN(nd)) {
    return { utcMs: Date.UTC(nd.getFullYear(), nd.getMonth(), nd.getDate()) };
  }

  return null;
}

function renderDayCalc(container) {
  const input     = container.querySelector('#dc-input');
  const resultBox = container.querySelector('#dc-result');
  const resultEl  = container.querySelector('#dc-result-main');

  function run() {
    const raw = input.value.trim();
    if (!raw) { resultBox.classList.remove('visible'); return; }

    const parsed = parseDateInput(raw);
    if (!parsed) {
      resultEl.innerHTML = `<span style="color:#c53030;font-size:0.9rem">Couldn't parse "${escHtml(raw)}"</span>`;
      resultBox.classList.add('visible');
      return;
    }

    const { utcMs } = parsed;
    const dayNum    = dateToGameDay(utcMs);
    const dow       = utcToGameDow(utcMs);
    const dateStr   = fmtDate(utcMs);

    resultEl.innerHTML =
      `<span class="dc-date">${escHtml(dateStr)}</span>` +
      `<span class="dc-sep">|</span>` +
      `<span class="dc-dow">${escHtml(dow)}</span>` +
      `<span class="dc-sep">|</span>` +
      `<span class="dc-day">Day ${dayNum}</span>`;
    resultBox.classList.add('visible');
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

// ── 4. Number ↔ Letters ───────────────────────────────────────────────────────

function renderNumToLetters(container) {
  const input  = container.querySelector('#nl-input');
  const result = container.querySelector('#nl-result');
  const output = container.querySelector('#nl-output');

  function run() {
    const raw = input.value.trim();
    if (!raw) { result.classList.remove('visible'); return; }
    const tokens = raw.split(/[\s,]+/).filter(t => t);
    const parts  = tokens.map(t => {
      const n = parseInt(t, 10);
      if (isNaN(n) || n < 1 || n > 26) return `[${t}?]`;
      return String.fromCharCode(64 + n);
    });
    output.textContent = parts.join(' ');
    result.classList.add('visible');
  }

  const revInput  = container.querySelector('#nl-rev-input');
  const revOutput = container.querySelector('#nl-rev-output');

  function runRev() {
    const raw = revInput.value.trim().toUpperCase();
    if (!raw) { revOutput.textContent = ''; return; }
    const parts = [...raw].filter(c => /[A-Z ]/.test(c)).map(c =>
      c === ' ' ? '  ' : `${c}=${c.charCodeAt(0) - 64}`
    );
    revOutput.textContent = parts.join('  ');
  }

  input.addEventListener('input', run);
  revInput.addEventListener('input', runRev);
}

// ── HTML template ─────────────────────────────────────────────────────────────

const TOOLS_HTML = /* html */`
<style>
  /* Numeric core results */
  .nc-output { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .nc-row {
    display: grid;
    grid-template-columns: minmax(90px,auto) 20px 1fr;
    grid-template-rows: auto auto auto;
    align-items: baseline;
    gap: 2px 6px;
    padding: 8px 10px;
    background: #f9f7ff;
    border: 1px solid #e0d4f8;
    border-radius: 6px;
  }
  .nc-label { font-family: 'Courier New', monospace; font-weight: 700; font-size: 0.95rem; color: var(--content-text); }
  .nc-parse-err { color: #c53030; font-style: italic; }
  .nc-arrow { color: var(--content-muted); text-align: center; }
  .nc-core { font-size: 1.2rem; font-weight: 700; color: var(--accent); }
  .nc-nocore { color: var(--content-muted); font-style: italic; font-size: 0.9rem; font-weight: 400; }
  .nc-flag { color: #c05a00; }
  .nc-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 7px;
    background: var(--gold);
    color: #2c1810;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
    vertical-align: middle;
  }
  .nc-asterisk { color: #c05a00; font-size: 1rem; vertical-align: super; }
  .nc-warn { grid-column: 1 / -1; font-size: 0.75rem; color: #c05a00; font-weight: 600; margin-top: 2px; }
  .nc-expr { grid-column: 1 / -1; font-size: 0.72rem; color: var(--content-muted); font-family: 'Courier New', monospace; margin-top: 2px; }
  .nc-empty { color: var(--content-muted); font-style: italic; font-size: 0.85rem; }
  .nc-hint { font-size: 0.75rem; color: var(--content-muted); margin-top: 4px; }
  /* Element tool */
  #pt-output { margin-top: 10px; }
  .pt-enc-label { font-size: 0.78rem; color: var(--content-muted); margin-bottom: 6px; }
  .pt-enc-row { display: flex; align-items: baseline; gap: 10px; padding: 5px 8px; background: #f9f7ff; border: 1px solid #e0d4f8; border-radius: 5px; margin-bottom: 4px; }
  .pt-enc-nums { font-family: 'Courier New', monospace; font-weight: 700; font-size: 1rem; color: var(--accent); }
  .pt-enc-syms { font-size: 0.85rem; color: var(--content-muted); }
  .pt-enc-more { font-size: 0.75rem; color: var(--content-muted); font-style: italic; margin-top: 4px; }
  .pt-no-enc  { font-size: 0.85rem; color: var(--content-muted); font-style: italic; }
  .pt-list-result { display: flex; flex-direction: column; gap: 5px; }
  .pt-list-row { display: flex; align-items: baseline; gap: 10px; }
  .pt-list-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--content-muted); min-width: 60px; flex-shrink: 0; }
  .pt-list-val { font-family: 'Courier New', monospace; font-size: 0.95rem; color: var(--accent); font-weight: 600; }
  .pt-list-names .pt-list-val { font-family: inherit; font-size: 0.82rem; color: var(--content-muted); font-weight: 400; }
  /* Date calculator result */
  .dc-date { font-size: 1.1rem; font-weight: 700; color: var(--content-text); }
  .dc-sep  { color: var(--content-muted); }
  .dc-dow  { font-size: 1.1rem; font-weight: 700; color: var(--accent); }
  .dc-day  { font-size: 1.1rem; font-weight: 700; color: var(--gold); }
</style>

<div class="content-header">
  <div class="content-title">Calculators</div>
  <div class="content-desc">Utility tools for solving Blue Prince puzzles.</div>
</div>
<div class="content-body">
  <div class="tools-grid">

    <!-- Row 1, Col 1: Day / Date Calculator -->
    <div class="card">
      <div class="card-title">Blue Prince Date Calculator</div>
      <p style="font-size:0.82rem;color:var(--content-muted);margin-bottom:10px;">
        Day 1 = <strong>Saturday, Nov 7, 1993</strong>. Enter a day number or any date.
      </p>
      <div class="field-row">
        <input type="text" id="dc-input" placeholder="25  or  10/31/1994  or  Oct 31, 1994"
          style="flex:1" autocomplete="off" spellcheck="false">
      </div>
      <div class="result-box" id="dc-result">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap" id="dc-result-main"></div>
      </div>
    </div>

    <!-- Row 1, Col 2: Number ↔ Letters -->
    <div class="card">
      <div class="card-title">Number ↔ Letter (A=1 … Z=26)</div>
      <p style="font-size:0.82rem;color:var(--content-muted);margin-bottom:10px;">
        Convert numbers to letters or letters to numbers.
      </p>
      <div class="field-row">
        <input type="text" id="nl-input" placeholder="e.g. 2 12 21 5  or  5,18,9,3" style="flex:1" autocomplete="off" spellcheck="false">
      </div>
      <div class="result-box" id="nl-result">
        <div class="result-main" id="nl-output" style="font-size:1.4rem;letter-spacing:0.1em"></div>
      </div>
      <div style="margin-top:12px">
        <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--accent);margin-bottom:6px">Letters → Numbers</div>
        <div class="field-row">
          <input type="text" id="nl-rev-input" placeholder="e.g. BLUE" style="flex:1" autocomplete="off" spellcheck="false">
        </div>
        <div style="font-family:'Courier New',monospace;font-size:0.85rem;color:var(--content-muted);min-height:1.4em;margin-top:4px;word-break:break-all" id="nl-rev-output"></div>
      </div>
    </div>

    <!-- Row 2, Col 1: Numeric Core -->
    <div class="card">
      <div class="card-title">Numeric Core</div>
      <p style="font-size:0.82rem;color:var(--content-muted);margin-bottom:10px;">
        Formats: <code>CLUE</code> (4 letters) &nbsp;·&nbsp;
        <code>1234</code> (4 digits) &nbsp;·&nbsp;
        <code>12345</code> (5 digits) &nbsp;·&nbsp;
        <code>[1000, 200, 11, 2]</code> (int list).
        Enter one value per line, or separate with spaces/commas.
      </p>
      <div style="display:flex;gap:8px;align-items:flex-start">
        <textarea id="nc-input" rows="3" placeholder=""
          style="flex:1;padding:8px 10px;border:1px solid var(--input-border);border-radius:6px;font-family:'Courier New',monospace;font-size:0.95rem;resize:vertical;color:var(--content-text);background:white;line-height:1.5"
          spellcheck="false" autocomplete="off"></textarea>
        <button class="btn" id="nc-btn" style="margin-top:2px">Compute</button>
      </div>
      <div class="nc-hint">Shift+Enter — compute &amp; clear &nbsp;·&nbsp; Ctrl+Enter — compute &amp; keep</div>
      <div class="nc-output" id="nc-output"></div>
    </div>

    <!-- Row 2, Col 2: Element Encoder / Decoder -->
    <div class="card">
      <div class="card-title">Element Encoder / Decoder</div>
      <p style="font-size:0.82rem;color:var(--content-muted);margin-bottom:10px;">
        <strong>Word</strong> — finds all element-symbol encodings (e.g. <code>Simon</code> → Si-Mo-N).<br>
        <strong>List</strong> (comma/space/hyphen separated) — converts between symbols and numbers
        (e.g. <code>Si-Mo-N</code> or <code>14,42,7</code>).
        Elements 1–111 only.
      </p>
      <div class="field-row">
        <input type="text" id="pt-input" placeholder="Simon  or  14,42,7  or  Si-Mo-N" style="flex:1" autocomplete="off" spellcheck="false">
      </div>
      <div id="pt-output"></div>
    </div>

  </div>
</div>
`;

// ── Init ──────────────────────────────────────────────────────────────────────

function initToolsTab(container) {
  container.innerHTML = TOOLS_HTML;
  renderDayCalc(container);
  renderNumericCore(container);
  renderElementTool(container);
  renderNumToLetters(container);
}
