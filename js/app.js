'use strict';

/**
 * app.js — Shell router and tab manager
 *
 * Hash-based routing: #tools, #anagram, #docs, #browser, #quickref, #layout
 * Tabs are lazy-initialized on first visit.
 * Iframe tabs (anagram, layout) have their src set once and stay loaded.
 */

// ── Tab registry ──────────────────────────────────────────────────────────────

const TABS = [
  {
    id:    'tools',
    pane:  'tab-tools',
    label: 'Calculators',
    init:  () => initToolsTab(document.getElementById('tab-tools')),
  },
  {
    id:    'anagram',
    pane:  'tab-anagram',
    label: 'Anagram Solver',
    iframe: 'anagram/index.html',
  },
  {
    id:    'docs',
    pane:  'tab-docs',
    label: 'All Documents',
    init:  () => initDocsTab(),
  },
  {
    id:    'browser',
    pane:  'tab-browser',
    label: 'Doc Browser',
    // placeholder — no init needed
  },
  {
    id:    'quickref',
    pane:  'tab-quickref',
    label: 'Quick Reference',
    // placeholder — no init needed
  },
  {
    id:    'layout',
    pane:  'tab-layout',
    label: 'Layout Organizer',
    iframe: 'layout-organizer/index.html',
  },
];

// Track which tabs have been initialized
const initialized = new Set();

// ── Routing ───────────────────────────────────────────────────────────────────

function getActiveTabId() {
  const hash = window.location.hash.replace('#', '');
  return TABS.find(t => t.id === hash) ? hash : TABS[0].id;
}

function navigateTo(tabId) {
  if (window.location.hash !== '#' + tabId) {
    window.location.hash = tabId;
  }
  activateTab(tabId);
}

function activateTab(tabId) {
  const tab = TABS.find(t => t.id === tabId);
  if (!tab) return;

  // Deactivate all
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  // Activate target pane
  const pane = document.getElementById(tab.pane);
  if (pane) pane.classList.add('active');

  // Activate nav item
  const navItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navItem) navItem.classList.add('active');

  // Lazy-init
  if (!initialized.has(tabId)) {
    initialized.add(tabId);

    if (tab.iframe) {
      // Inject iframe — created once, stays loaded
      const iframe = document.createElement('iframe');
      iframe.src = tab.iframe;
      iframe.title = tab.label;
      pane.appendChild(iframe);
    } else if (tab.init) {
      tab.init();
    }
  }
}

// ── Nav click handlers ────────────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const tabId = item.dataset.tab;
    if (tabId) navigateTo(tabId);
  });
});

// ── Hash change ───────────────────────────────────────────────────────────────

window.addEventListener('hashchange', () => {
  activateTab(getActiveTabId());
});

// ── Boot ──────────────────────────────────────────────────────────────────────

activateTab(getActiveTabId());
