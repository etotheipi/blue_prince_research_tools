'use strict';

/**
 * tab-docs.js — All Documents viewer
 *
 * Exposes: initDocsTab()
 *
 * Loads content/master_ref.md, renders it with marked.js, and provides
 * an in-page search that highlights all matches and lets you navigate
 * between them with prev/next buttons.
 */

let docsInitialized = false;
let allHits = [];
let currentHit = -1;

function initDocsTab() {
  if (docsInitialized) return;
  docsInitialized = true;

  const contentEl = document.getElementById('docs-content');
  const searchEl  = document.getElementById('docs-search');
  const countEl   = document.getElementById('docs-search-count');
  const prevBtn   = document.getElementById('docs-prev');
  const nextBtn   = document.getElementById('docs-next');

  // ── Load & render markdown ──────────────────────────────────────────────

  fetch('content/master_ref.md')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then(md => {
      contentEl.classList.remove('loading');
      contentEl.innerHTML = marked.parse(md);
    })
    .catch(err => {
      contentEl.classList.remove('loading');
      contentEl.textContent = `Failed to load documents: ${err.message}`;
    });

  // ── Search ──────────────────────────────────────────────────────────────

  let searchTimer = null;

  searchEl.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(this.value.trim()), 200);
  });

  searchEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prevHit(); else nextHit();
    }
  });

  prevBtn.addEventListener('click', prevHit);
  nextBtn.addEventListener('click', nextHit);

  function runSearch(query) {
    // Clear existing highlights
    clearHighlights();
    allHits = [];
    currentHit = -1;

    if (!query || query.length < 2) {
      updateNav();
      return;
    }

    // Walk all text nodes in docs-content and highlight matches
    highlightInElement(contentEl, query);
    allHits = Array.from(contentEl.querySelectorAll('mark.search-hit'));

    if (allHits.length > 0) {
      currentHit = 0;
      scrollToHit(0);
    }
    updateNav();
  }

  function clearHighlights() {
    contentEl.querySelectorAll('mark.search-hit').forEach(mark => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
  }

  function highlightInElement(el, query) {
    const q = query.toLowerCase();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Skip script/style content
        const tag = node.parentNode.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
        return node.textContent.toLowerCase().includes(q)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
    });

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    for (const textNode of textNodes) {
      const text  = textNode.textContent;
      const lower = text.toLowerCase();
      const frag  = document.createDocumentFragment();
      let idx = 0;

      while (idx < text.length) {
        const pos = lower.indexOf(q, idx);
        if (pos === -1) {
          frag.appendChild(document.createTextNode(text.slice(idx)));
          break;
        }
        if (pos > idx) {
          frag.appendChild(document.createTextNode(text.slice(idx, pos)));
        }
        const mark = document.createElement('mark');
        mark.className = 'search-hit';
        mark.textContent = text.slice(pos, pos + q.length);
        frag.appendChild(mark);
        idx = pos + q.length;
      }

      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  function scrollToHit(idx) {
    if (!allHits[idx]) return;
    allHits.forEach((m, i) => m.classList.toggle('current', i === idx));
    allHits[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function nextHit() {
    if (!allHits.length) return;
    currentHit = (currentHit + 1) % allHits.length;
    scrollToHit(currentHit);
    updateNav();
  }

  function prevHit() {
    if (!allHits.length) return;
    currentHit = (currentHit - 1 + allHits.length) % allHits.length;
    scrollToHit(currentHit);
    updateNav();
  }

  function updateNav() {
    const n = allHits.length;
    if (n === 0) {
      const q = searchEl.value.trim();
      countEl.textContent = q.length >= 2 ? 'No matches' : '';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
    } else {
      countEl.textContent = `${currentHit + 1} / ${n}`;
      prevBtn.disabled = false;
      nextBtn.disabled = false;
    }
  }
}
