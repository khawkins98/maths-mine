// game/referenceTray.js — Times-Table Reference Tray ("Cheat Sheet").
// A slide-out reference of all times tables (1 to 12), accessible from every screen.
// Consulting it is treated as learning and voids the live question in the mastery ledger.

import { createTimers } from '../core/timers.js';

export function createReferenceTray({ mastery, ui } = {}) {
  const timers = createTimers();

  let activeTable = 2;
  let isOpen = false;
  let returnFocus = null;
  const inertedByTray = new Set();

  // Track event listeners for clean teardown
  const listeners = [];
  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    listeners.push({ target, type, fn, opts });
  }

  // ── 1. Create Right-Edge Trigger Tab ──
  const tab = document.createElement('button');
  tab.id = 'btn-ref-tab';
  tab.setAttribute('aria-label', 'Open Times Tables Reference Tray');
  tab.innerHTML = '<span class="ref-tab-icon">📖</span><span class="ref-tab-label">Tables</span>';
  document.body.appendChild(tab);

  // ── 2. Create Tray Overlay & Backdrop ──
  const backdrop = document.createElement('div');
  backdrop.id = 'ref-backdrop';
  document.body.appendChild(backdrop);

  const tray = document.createElement('aside');
  tray.id = 'ref-tray';
  tray.setAttribute('role', 'dialog');
  tray.setAttribute('aria-modal', 'true');
  tray.setAttribute('aria-labelledby', 'ref-title');
  tray.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tray);

  function setBackgroundInert(on) {
    if (on) {
      for (const node of document.body.children) {
        if (node === tray || node === backdrop || node.tagName === 'SCRIPT' || node.inert) continue;
        node.inert = true;
        inertedByTray.add(node);
      }
      return;
    }
    for (const node of inertedByTray) {
      if (node.isConnected) node.inert = false;
    }
    inertedByTray.clear();
  }

  function focusableElements() {
    return [...tray.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((node) => !node.inert && node.getClientRects().length > 0);
  }

  function getTableColor(tableNum) {
    const colors = [
      '#57ab3b', // 1: Grass
      '#41d47f', // 2: Emerald
      '#3fa9f5', // 3: Diamond / Sky
      '#f5a623', // 4: Gold
      '#e07b3c', // 5: Copper
      '#9b51e0', // 6: Amethyst
      '#d9534f', // 7: Redstone
      '#795548', // 8: Wood
      '#607d8b', // 9: Stone
      '#2e7d32', // 10: Dark Green
      '#00897b', // 11: Prismarine
      '#212121', // 12: Obsidian
    ];
    return colors[(tableNum - 1) % colors.length];
  }

  function renderArrayGrid(factorA, factorB, color) {
    // Lay out with smaller factor as rows and larger factor as columns so arrays expand horizontally across the card
    const rows = Math.min(factorA, factorB);
    const cols = Math.max(factorA, factorB);
    let html = `<div class="ref-array" style="--array-rows: ${rows}; --array-cols: ${cols};">`;
    const total = rows * cols;
    const blockCount = Math.min(total, 144);
    for (let i = 0; i < blockCount; i++) {
      html += `<div class="ref-block" style="background: ${color};"></div>`;
    }
    html += '</div>';
    return html;
  }

  function renderTablePage(tableNum) {
    const color = getTableColor(tableNum);
    let html = `
      <div class="ref-header">
        <h2 id="ref-title">${tableNum} × Table</h2>
        <button class="ref-close" id="btn-ref-close" aria-label="Close Reference Tray">✕</button>
      </div>
      <div class="ref-rows">
    `;

    for (let i = 1; i <= 12; i++) {
      const product = tableNum * i;
      html += `
        <div class="ref-row">
          <div class="ref-eq">
            <span class="ref-factors">${tableNum} × ${i}</span>
            <span class="ref-prod">${product}</span>
          </div>
          <div class="ref-vis">
            ${renderArrayGrid(tableNum, i, color)}
          </div>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  function render() {
    let railHtml = '<nav class="ref-rail" aria-label="Select Times Table">';
    for (let n = 1; n <= 12; n++) {
      const isActive = (n === activeTable);
      railHtml += `
        <button class="ref-rail-btn ${isActive ? 'active' : ''}" data-table="${n}"${isActive ? ' aria-current="true"' : ''}>
          ${n}
        </button>
      `;
    }
    railHtml += '</nav>';

    const contentHtml = `<main class="ref-content">${renderTablePage(activeTable)}</main>`;
    tray.innerHTML = railHtml + contentHtml;

    // Attach rail button listeners
    tray.querySelectorAll('.ref-rail-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTable = parseInt(btn.dataset.table, 10);
        render();
        tray.querySelector(`.ref-rail-btn[data-table="${activeTable}"]`)?.focus({ preventScroll: true });
      });
    });

    // Attach close button
    const btnClose = tray.querySelector('#btn-ref-close');
    if (btnClose) {
      btnClose.addEventListener('click', close);
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Void the current live question in mastery ledger as per the spec
    if (mastery && typeof mastery.voidCurrentQuestion === 'function') {
      mastery.voidCurrentQuestion();
    }

    // Auto-select active table if single-fact question
    if (mastery && mastery.referenceKey) {
      const parts = mastery.referenceKey.split('x');
      if (parts.length === 2) {
        const factorA = parseInt(parts[0], 10);
        if (factorA >= 1 && factorA <= 12) activeTable = factorA;
      }
    }

    render();
    setBackgroundInert(true);
    backdrop.classList.add('open');
    tray.classList.add('open');
    tray.setAttribute('aria-hidden', 'false');
    tab.classList.add('active');
    tray.querySelector('#btn-ref-close')?.focus({ preventScroll: true });
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen) return;
    isOpen = false;
    backdrop.classList.remove('open');
    tray.classList.remove('open');
    tray.setAttribute('aria-hidden', 'true');
    tab.classList.remove('active');
    setBackgroundInert(false);
    const target = returnFocus;
    returnFocus = null;
    if (restoreFocus && target?.isConnected && !target.inert) target.focus({ preventScroll: true });
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // ── Event Handlers ──
  on(tab, 'click', toggle);
  on(backdrop, 'click', close);

  on(window, 'keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab' && isOpen) {
      const focusable = focusableElements();
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !tray.contains(document.activeElement))) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && (document.activeElement === last || !tray.contains(document.activeElement))) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
  });

  // Expose debug / test hooks
  window.__refTray = {
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    getActiveTable: () => activeTable,
    setActiveTable: (n) => { activeTable = n; render(); },
  };

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    teardown: () => {
      close({ restoreFocus: false });
      if (tray.contains(document.activeElement)) document.activeElement.blur();
      setBackgroundInert(false);
      while (listeners.length) {
        const { target, type, fn, opts } = listeners.pop();
        target.removeEventListener(type, fn, opts);
      }
      timers.clearAll();
      tab.remove();
      backdrop.remove();
      tray.remove();
      delete window.__refTray;
    },
  };
}
