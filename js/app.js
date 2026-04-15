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

const DEFAULT_TAB = 'docs';

// Track which tabs have been initialized
const initialized = new Set();

// ── Routing ───────────────────────────────────────────────────────────────────

function getActiveTabId() {
  const hash = window.location.hash.replace('#', '');
  return TABS.find(t => t.id === hash) ? hash : DEFAULT_TAB;
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

  // Analytics: track tab views (GoatCounter SPA tracking)
  if (window.goatcounter && window.goatcounter.count) {
    window.goatcounter.count({ path: '/#' + tabId, title: tab.label });
  }
}

// ── Nav click handlers ────────────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const tabId = item.dataset.tab;
    if (tabId) {
      navigateTo(tabId);
      // Auto-close sidebar on mobile after selecting a tab
      if (window.innerWidth <= 640) {
        setSidebarCollapsed(true);
      }
    }
  });
});

// ── Hash change ───────────────────────────────────────────────────────────────

window.addEventListener('hashchange', () => {
  activateTab(getActiveTabId());
});

// ── Sidebar collapse ──────────────────────────────────────────────────────────

const sidebar         = document.getElementById('sidebar');
const sidebarToggle   = document.getElementById('sidebar-toggle');
const mobileMenuBtn   = document.getElementById('mobile-menu-btn');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

function setSidebarCollapsed(collapsed) {
  sidebar.classList.toggle('collapsed', collapsed);
  sidebarToggle.textContent  = collapsed ? '›' : '‹';
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');

  const isMobile = window.innerWidth <= 640;
  mobileMenuBtn.style.display = (isMobile && collapsed) ? 'block' : '';
  sidebarBackdrop.classList.toggle('visible', isMobile && !collapsed);

  if (!isMobile) {
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  }
}

sidebarToggle.addEventListener('click', () => {
  setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
});

mobileMenuBtn.addEventListener('click', () => {
  setSidebarCollapsed(false);
});

sidebarBackdrop.addEventListener('click', () => {
  setSidebarCollapsed(true);
});

// ── Boot ──────────────────────────────────────────────────────────────────────

// Restore desktop sidebar state; collapse by default on mobile
const isMobileOnLoad = window.innerWidth <= 640;
if (isMobileOnLoad) {
  setSidebarCollapsed(true);
} else {
  const saved = localStorage.getItem('sidebarCollapsed');
  setSidebarCollapsed(saved === '1');
}

activateTab(getActiveTabId());
