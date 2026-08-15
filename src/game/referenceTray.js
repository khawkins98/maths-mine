// game/referenceTray.js — Times-Table Reference Tray ("Cheat Sheet").
// A slide-out reference of all times tables (1 to 12), accessible from every screen.
// Consulting it is treated as learning and voids the live question in the mastery ledger.

import { createTimers } from '../core/timers.js';

export function createReferenceTray({ mastery, ui } = {}) {
  const timers = createTimers();

  let activeTable = 2;
  let isOpen = false;

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
  backdrop.className = 'hidden';
  document.body.appendChild(backdrop);

  const tray = document.createElement('aside');
  tray.id = 'ref-tray';
  tray.className = 'hidden';
  tray.setAttribute('aria-label', 'Times Tables Reference Tray');
  document.body.appendChild(tray);

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

  function renderArrayGrid(rows, cols, color) {
    let html = `<div class="ref-array" style="--array-rows: ${rows}; --array-cols: ${cols};">`;
    const total = rows * cols;
    // For small tables render individual blocks; for huge ones render compact grid
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
        <h2>${tableNum} × Tables</h2>
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
            <span class="ref-eq-sym">=</span>
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
        <button class="ref-rail-btn ${isActive ? 'active' : ''}" data-table="${n}">
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
    backdrop.classList.remove('hidden');
    tray.classList.remove('hidden');
    tab.classList.add('active');
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.classList.add('hidden');
    tray.classList.add('hidden');
    tab.classList.remove('active');
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
