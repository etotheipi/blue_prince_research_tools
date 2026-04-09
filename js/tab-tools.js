'use strict';

/**
 * tab-tools.js — Calculators tab
 *
 * Exposes: initToolsTab(container)
 *
 * Calculators:
 *   1. Numeric Core Reducer  — iteratively sum digits until single digit
 *   2. Periodic Table Lookup — search by symbol, name, or atomic number
 *   3. Day of Week Calc      — start day + offset → result day
 *   4. Number → Letters      — A=1 … Z=26 mappings
 */

// ── Periodic table data ───────────────────────────────────────────────────────

let elementsData = null; // loaded lazily

async function loadElements() {
  if (elementsData) return elementsData;
  const resp = await fetch('data/elements.json');
  elementsData = await resp.json();
  return elementsData;
}

// ── 1. Numeric Core Reducer ───────────────────────────────────────────────────

function numericCore(n) {
  // Digital root: handles negative and non-integers by taking abs + floor
  n = Math.abs(Math.floor(n));
  if (n === 0) return { result: 0, steps: ['0 → 0'] };
  const steps = [];
  let current = n;
  while (current >= 10) {
    const digits = String(current).split('').map(Number);
    const next = digits.reduce((a, b) => a + b, 0);
    steps.push(`${current} → ${digits.join(' + ')} = ${next}`);
    current = next;
  }
  return { result: current, steps };
}

function renderNumericCore(container) {
  const input = container.querySelector('#nc-input');
  const resultBox = container.querySelector('#nc-result');
  const resultMain = container.querySelector('#nc-result-main');
  const resultSteps = container.querySelector('#nc-result-steps');

  function run() {
    const raw = input.value.trim();
    // Allow simple arithmetic expressions
    let n;
    try {
      // Only allow digits, spaces, +, -, *, /, (, ), .
      if (!/^[0-9\s\+\-\*\/\(\)\.]+$/.test(raw)) throw new Error('invalid');
      // eslint-disable-next-line no-new-func
      n = Function('"use strict"; return (' + raw + ')')();
      if (typeof n !== 'number' || !isFinite(n)) throw new Error('invalid');
    } catch {
      resultBox.classList.remove('visible');
      return;
    }
    const { result, steps } = numericCore(n);
    resultMain.textContent = `Core: ${result}`;
    if (steps.length === 0) {
      resultSteps.textContent = `${n} is already a single digit.`;
    } else {
      resultSteps.innerHTML = steps.map(s => `<div>${s}</div>`).join('');
    }
    resultBox.classList.add('visible');
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

// ── 2. Periodic Table Lookup ──────────────────────────────────────────────────

function renderPeriodicLookup(container) {
  const input  = container.querySelector('#pt-input');
  const result = container.querySelector('#pt-result');
  const symBox = container.querySelector('#pt-sym');
  const numBox = container.querySelector('#pt-num');

  function displayElement(el) {
    container.querySelector('#pt-symbol').textContent = el.s;
    container.querySelector('#pt-number').textContent = el.n;
    container.querySelector('#pt-name').textContent   = el.nm;
    container.querySelector('#pt-mass').textContent   = el.m;
    container.querySelector('#pt-period').textContent = el.p;
    container.querySelector('#pt-group').textContent  = el.g ?? 'Lanthanide/Actinide';
    result.classList.add('visible');
  }

  async function run() {
    const q = input.value.trim();
    if (!q) { result.classList.remove('visible'); return; }
    const elements = await loadElements();

    // Try atomic number first
    const asNum = parseInt(q, 10);
    if (!isNaN(asNum)) {
      const el = elements.find(e => e.n === asNum);
      if (el) { displayElement(el); return; }
    }

    // Try symbol (case-insensitive, exact)
    const bySymbol = elements.find(e => e.s.toLowerCase() === q.toLowerCase());
    if (bySymbol) { displayElement(bySymbol); return; }

    // Try name prefix
    const byName = elements.find(e => e.nm.toLowerCase().startsWith(q.toLowerCase()));
    if (byName) { displayElement(byName); return; }

    result.classList.remove('visible');
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

// ── 3. Day of Week Calculator ─────────────────────────────────────────────────

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function renderDayCalc(container) {
  const startSel  = container.querySelector('#dc-start');
  const offsetInp = container.querySelector('#dc-offset');
  const resultBox = container.querySelector('#dc-result');
  const resultMain = container.querySelector('#dc-result-main');
  const resultDetail = container.querySelector('#dc-result-detail');

  function run() {
    const startIdx = parseInt(startSel.value, 10);
    const offset   = parseInt(offsetInp.value, 10);
    if (isNaN(startIdx) || isNaN(offset)) { resultBox.classList.remove('visible'); return; }

    const resultIdx = ((startIdx + offset) % 7 + 7) % 7;
    resultMain.textContent = DAYS[resultIdx];
    const sign = offset >= 0 ? '+' : '';
    resultDetail.textContent =
      `${DAYS[startIdx]} ${sign}${offset} day${Math.abs(offset) === 1 ? '' : 's'} = ${DAYS[resultIdx]}`;
    resultBox.classList.add('visible');
  }

  // Day gap calculator (reverse: given start + end, how many days?)
  const gapStart  = container.querySelector('#dc-gap-start');
  const gapEnd    = container.querySelector('#dc-gap-end');
  const gapResult = container.querySelector('#dc-gap-result');

  function runGap() {
    const s = parseInt(gapStart.value, 10);
    const e = parseInt(gapEnd.value, 10);
    if (isNaN(s) || isNaN(e)) { gapResult.textContent = ''; return; }
    const fwd = ((e - s) + 7) % 7;
    const back = fwd === 0 ? 0 : 7 - fwd;
    if (fwd === 0) {
      gapResult.textContent = 'Same day (0 days apart, or multiples of 7)';
    } else {
      gapResult.textContent =
        `${DAYS[s]} → ${DAYS[e]}: forward ${fwd} day${fwd===1?'':'s'}, backward ${back} day${back===1?'':'s'}`;
    }
  }

  startSel.addEventListener('change', run);
  offsetInp.addEventListener('input', run);
  gapStart.addEventListener('change', runGap);
  gapEnd.addEventListener('change', runGap);
}

// ── 4. Number → Letters (A=1…Z=26) ───────────────────────────────────────────

function renderNumToLetters(container) {
  const input  = container.querySelector('#nl-input');
  const result = container.querySelector('#nl-result');
  const output = container.querySelector('#nl-output');

  function run() {
    const raw = input.value.trim();
    if (!raw) { result.classList.remove('visible'); return; }

    // Parse comma- or space-separated numbers
    const tokens = raw.split(/[\s,]+/).filter(t => t);
    const parts = tokens.map(t => {
      const n = parseInt(t, 10);
      if (isNaN(n) || n < 1 || n > 26) return `[${t}?]`;
      return String.fromCharCode(64 + n); // A=65
    });

    output.textContent = parts.join(' ');
    result.classList.add('visible');
  }

  // Also show reverse: typed letters → numbers
  const revInput  = container.querySelector('#nl-rev-input');
  const revOutput = container.querySelector('#nl-rev-output');

  function runRev() {
    const raw = revInput.value.trim().toUpperCase();
    if (!raw) { revOutput.textContent = ''; return; }
    const parts = raw.split('').filter(c => /[A-Z ]/.test(c)).map(c => {
      if (c === ' ') return '  ';
      return `${c}=${c.charCodeAt(0) - 64}`;
    });
    revOutput.textContent = parts.join('  ');
  }

  input.addEventListener('input', run);
  revInput.addEventListener('input', runRev);
}

// ── HTML template ─────────────────────────────────────────────────────────────

const TOOLS_HTML = /* html */`
<div class="content-header">
  <div class="content-title">Calculators</div>
  <div class="content-desc">Utility tools for solving Blue Prince puzzles.</div>
</div>
<div class="content-body">
  <div class="tools-grid">

    <!-- 1. Numeric Core -->
    <div class="card">
      <div class="card-title">Numeric Core Reducer</div>
      <p style="font-size:0.82rem;color:var(--content-muted);margin-bottom:10px;">
        Repeatedly sum the digits of a number until a single digit remains (1–9).
        Also accepts simple math expressions.
      </p>
      <div class="field-row">
        <input type="text" id="nc-input" placeholder="e.g. 497 or 12+35" style="flex:1" autocomplete="off" spellcheck="false">
      </div>
      <div class="result-box" id="nc-result">
        <div class="result-main" id="nc-result-main"></div>
        <div class="result-steps" id="nc-result-steps"></div>
      </div>
    </div>

    <!-- 2. Periodic Table -->
    <div class="card">
      <div class="card-title">Periodic Table Lookup</div>
      <p style="font-size:0.82rem;color:var(--content-muted);margin-bottom:10px;">
        Search by atomic number, symbol, or element name.
      </p>
      <div class="field-row">
        <input type="text" id="pt-input" placeholder="e.g. 79, Au, or Gold" style="flex:1" autocomplete="off" spellcheck="false">
      </div>
      <div class="result-box" id="pt-result">
        <div class="element-card">
          <div class="element-symbol-box">
            <div class="sym" id="pt-symbol"></div>
            <div class="num" id="pt-number"></div>
          </div>
          <div class="element-info-grid">
            <div class="element-info-item">
              <div class="element-info-label">Name</div>
              <div class="element-info-value" id="pt-name"></div>
            </div>
            <div class="element-info-item">
              <div class="element-info-label">Atomic Mass</div>
              <div class="element-info-value" id="pt-mass"></div>
            </div>
            <div class="element-info-item">
              <div class="element-info-label">Period</div>
              <div class="element-info-value" id="pt-period"></div>
            </div>
            <div class="element-info-item">
              <div class="element-info-label">Group</div>
              <div class="element-info-value" id="pt-group"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Day Calculator -->
    <div class="card">
      <div class="card-title">Day of Week Calculator</div>

      <p style="font-size:0.82rem;color:var(--content-muted);margin-bottom:10px;">
        Add or subtract days from a starting day.
      </p>
      <div class="field-row">
        <select id="dc-start">
          <option value="0">Sunday</option>
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
          <option value="6">Saturday</option>
        </select>
        <span style="font-size:0.85rem;color:var(--content-muted)">+/−</span>
        <input type="number" id="dc-offset" value="0" style="width:80px">
        <span style="font-size:0.85rem;color:var(--content-muted)">days</span>
      </div>
      <div class="result-box visible" id="dc-result">
        <div class="result-main" id="dc-result-main">Sunday</div>
        <div class="result-detail" id="dc-result-detail"></div>
      </div>

      <hr style="margin:14px 0;border:none;border-top:1px solid var(--content-border)">

      <p style="font-size:0.82rem;color:var(--content-muted);margin-bottom:10px;">
        How many days between two days of the week?
      </p>
      <div class="field-row">
        <select id="dc-gap-start">
          <option value="0">Sunday</option>
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
          <option value="6">Saturday</option>
        </select>
        <span style="font-size:0.85rem;color:var(--content-muted)">→</span>
        <select id="dc-gap-end">
          <option value="0">Sunday</option>
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
          <option value="6">Saturday</option>
        </select>
      </div>
      <div style="font-size:0.85rem;color:var(--accent);min-height:1.4em;margin-top:4px" id="dc-gap-result"></div>
    </div>

    <!-- 4. Number → Letters -->
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

  </div>
</div>
`;

// ── Init ──────────────────────────────────────────────────────────────────────

function initToolsTab(container) {
  container.innerHTML = TOOLS_HTML;
  renderNumericCore(container);
  renderPeriodicLookup(container);
  renderDayCalc(container);
  renderNumToLetters(container);

  // Trigger the day calc initial render
  container.querySelector('#dc-start').dispatchEvent(new Event('change'));
}
