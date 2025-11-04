/**
 * tables-select.js (event-delegation version)
 * - Persists selected table (and price) in sessionStorage
 * - Emits 'reserved-price-changed' event when selection changes so the app can re-render totals immediately
 * - Hardened MutationObserver to avoid feedback loops
 *
 * Changes:
 * 1) Do not reapply persisted selection on a page "reload". We detect navigation reloads
 *    and clear the stored selection so it does not survive Ctrl+F5 / page reloads.
 *    (We still persist selection during normal in-app interactions so it survives UI re-renders.)
 * 2) When a table is selected and the summary is shown, hide the "Choose table" button (#open-tables-btn).
 *    When the selection is cleared the Choose button is re-shown.
 *
 * Note: We use the Navigation Timing API to detect reload navigation (performance.getEntriesByType('navigation')[0].type === 'reload').
 * This will clear persisted selection on any reload (including Ctrl+F5).
 */

(function () {
  let selectedTable = null;
  let observer = null;
  const STORAGE_KEY = 'clubtryara:selected_table_v1';

  function persistSelectedTable(table) {
    try {
      if (!table) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(table));
    } catch (err) {
      console.warn('Failed to persist selected table', err);
    }
  }

  function restoreSelectedTable() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Failed to parse persisted selected table', err);
      return null;
    }
  }

  function clearPersistedOnReloadIfNeeded() {
    try {
      // Use Navigation Timing Level 2 when available
      const navEntries = performance.getEntriesByType && performance.getEntriesByType('navigation');
      const navType = Array.isArray(navEntries) && navEntries[0] && navEntries[0].type
        ? navEntries[0].type
        : (performance.navigation && performance.navigation.type === 1 ? 'reload' : '');

      // If navigation type is 'reload' then clear persisted selection so it won't survive Ctrl+F5/hard reload.
      if (navType === 'reload') {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      // ignore errors, do nothing
    }
  }

  function emitReservedPriceChanged() {
    try {
      const ev = new CustomEvent('reserved-price-changed', { detail: { price: parseFloat(document.body.dataset.reservedTablePrice || 0) || 0 } });
      window.dispatchEvent(ev);
    } catch (e) {
      // ignore
    }
  }

  // create the summary node (returns the element)
  function createSummaryNode() {
    const summary = document.createElement('div');
    summary.id = 'selected-table-summary';
    summary.style.display = 'none';
    summary.style.marginTop = '8px';
    summary.style.fontSize = '13px';

    summary.innerHTML =
      'Selected table: <strong id="selected-table-name">—</strong> (Party size: <span id="selected-table-party">—</span>, Price: ₱<span id="selected-table-price">0.00</span>)';

    // Clear button (created here so handler can be attached or replaced)
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.id = 'clear-selected-table';
    clearBtn.className = 'btn-link';
    clearBtn.style.marginLeft = '8px';
    clearBtn.textContent = 'Clear';
    summary.appendChild(clearBtn);

    return summary;
  }

  // ensure Clear button has handler (idempotent)
  function ensureClearHandler() {
    const clearBtn = document.getElementById('clear-selected-table');
    if (!clearBtn) return;
    // remove previous duplicate handlers by replacing the node with a clone
    const clone = clearBtn.cloneNode(true);
    clearBtn.parentNode.replaceChild(clone, clearBtn);
    clone.addEventListener('click', () => {
      clearSelectedTable();
    });
  }

  // helper: show/hide choose button
  function setChooseButtonVisible(visible) {
    const chooseBtn = document.getElementById('open-tables-btn');
    if (!chooseBtn) return;
    chooseBtn.style.display = visible ? '' : 'none';
  }

  function ensureReservedUI() {
    const orderCompute = document.getElementById('orderCompute') || document.querySelector('.order-compute');
    const orderSection = document.querySelector('.order-section');
    if (!orderCompute && !orderSection) return;

    // If reserved-block exists, make sure its inner pieces (summary, clear) exist and handlers attached
    let reservedBlock = document.querySelector('.reserved-table-block');
    if (reservedBlock) {
      // ensure checkbox exists
      let checkbox = document.getElementById('use-reserved-table');
      if (!checkbox) {
        // try to find a label to insert into, otherwise prepend
        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'use-reserved-table';
        checkbox.setAttribute('aria-controls', 'tablesModal');
        // best-effort: append to first label inside reservedBlock if exists
        const lbl = reservedBlock.querySelector('.reserved-checkbox-label');
        if (lbl) lbl.insertBefore(checkbox, lbl.firstChild);
        else {
          const newLabel = document.createElement('label');
          newLabel.className = 'reserved-checkbox-label';
          newLabel.style.display = 'flex';
          newLabel.style.alignItems = 'center';
          newLabel.style.gap = '8px';
          const span = document.createElement('span');
          span.textContent = 'Customer has a reserved table';
          newLabel.appendChild(checkbox);
          newLabel.appendChild(span);
          reservedBlock.insertBefore(newLabel, reservedBlock.firstChild.nextSibling);
        }
      }
      // ensure choose button exists
      let chooseBtn = document.getElementById('open-tables-btn');
      if (!chooseBtn) {
        chooseBtn = document.createElement('button');
        chooseBtn.type = 'button';
        chooseBtn.id = 'open-tables-btn';
        chooseBtn.className = 'btn-small';
        chooseBtn.textContent = 'Choose table';
        chooseBtn.disabled = true;
        chooseBtn.style.marginTop = '8px';
        reservedBlock.appendChild(chooseBtn);
      }
      // ensure summary exists
      let summary = document.getElementById('selected-table-summary');
      if (!summary) {
        summary = createSummaryNode();
        reservedBlock.appendChild(summary);
      } else {
        // ensure Clear button present
        if (!document.getElementById('clear-selected-table')) {
          const clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.id = 'clear-selected-table';
          clearBtn.className = 'btn-link';
          clearBtn.style.marginLeft = '8px';
          clearBtn.textContent = 'Clear';
          summary.appendChild(clearBtn);
        }
      }
      // attach clear handler safely
      ensureClearHandler();
      return;
    }

    // If we reached here, reservedBlock is missing -> build it fresh
    reservedBlock = document.createElement('div');
    reservedBlock.className = 'reserved-table-block';
    reservedBlock.style.padding = '8px';
    reservedBlock.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
    reservedBlock.style.boxSizing = 'border-box';

    // Title above the compute area
    const title = document.createElement('div');
    title.id = 'reserved-table-title';
    title.textContent = 'Reserved Table';
    title.style.fontSize = '13px';
    title.style.fontWeight = '600';
    title.style.marginBottom = '6px';
    reservedBlock.appendChild(title);

    const label = document.createElement('label');
    label.className = 'reserved-checkbox-label';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '8px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'use-reserved-table';
    checkbox.setAttribute('aria-controls', 'tablesModal');

    const span = document.createElement('span');
    span.textContent = 'Customer has a reserved table';

    label.appendChild(checkbox);
    label.appendChild(span);
    reservedBlock.appendChild(label);

    const chooseBtn = document.createElement('button');
    chooseBtn.type = 'button';
    chooseBtn.id = 'open-tables-btn';
    chooseBtn.className = 'btn-small';
    chooseBtn.textContent = 'Choose table';
    chooseBtn.disabled = true;
    chooseBtn.style.marginTop = '8px';
    reservedBlock.appendChild(chooseBtn);

    const summary = createSummaryNode();
    reservedBlock.appendChild(summary);

    if (orderCompute) {
      const computeActions = orderCompute.querySelector('.compute-actions');
      if (computeActions) {
        orderCompute.insertBefore(reservedBlock, computeActions);
      } else {
        orderCompute.insertBefore(reservedBlock, orderCompute.firstChild);
      }
    } else {
      const orderButtons = orderSection.querySelector('.order-buttons');
      if (orderButtons) {
        orderSection.insertBefore(reservedBlock, orderButtons);
      } else {
        orderSection.appendChild(reservedBlock);
      }
    }

    // attach Clear handler
    ensureClearHandler();

    // checkbox change handler
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        chooseBtn.disabled = false;
        const tablesLoading = document.getElementById('tables-loading');
        if (tablesLoading) tablesLoading.style.display = '';
        fetchTables(true)
          .then((data) => {
            renderTablesToModal(data);
          })
          .catch((err) => {
            console.error('Failed to prefetch tables', err);
            const tl = document.getElementById('tables-loading');
            if (tl) tl.textContent = 'Failed to load tables (prefetch).';
          });
      } else {
        chooseBtn.disabled = true;
        clearSelectedTable();
      }
    });
  }

  function renderTablesToModal(rows) {
    const tablesLoading = document.getElementById('tables-loading');
    const tablesEmpty = document.getElementById('tables-empty');
    const tablesList = document.getElementById('tables-list');
    if (tablesLoading) tablesLoading.style.display = 'none';

    if (!Array.isArray(rows) || rows.length === 0) {
      if (tablesList) tablesList.style.display = 'none';
      if (tablesEmpty) tablesEmpty.style.display = '';
      return;
    }
    if (tablesList) tablesList.style.display = '';
    if (tablesEmpty) tablesEmpty.style.display = 'none';

    const tbody = tablesList.querySelector('tbody');
    tbody.innerHTML = '';

    rows.forEach((t) => {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.style.padding = '6px';
      nameTd.textContent = t.name || t.guest_name || '';
      tr.appendChild(nameTd);

      const numberTd = document.createElement('td');
      numberTd.style.padding = '6px';
      numberTd.textContent = t.table_number || t.table_no || t.id || '';
      tr.appendChild(numberTd);

      const partyTd = document.createElement('td');
      partyTd.style.padding = '6px';
      partyTd.textContent = t.party_size || t.pax || '';
      tr.appendChild(partyTd);

      const statusTd = document.createElement('td');
      statusTd.style.padding = '6px';
      statusTd.textContent = t.status || t.reservation_status || '';
      tr.appendChild(statusTd);

      const priceTd = document.createElement('td');
      priceTd.style.padding = '6px';
      priceTd.style.textAlign = 'right';
      priceTd.textContent = (parseFloat(t.price) || 0).toFixed(2);
      tr.appendChild(priceTd);

      const actionTd = document.createElement('td');
      actionTd.style.padding = '6px';
      const selectBtn = document.createElement('button');
      selectBtn.className = 'btn-small table-select-btn';
      selectBtn.type = 'button';
      selectBtn.textContent = 'Select';
      selectBtn.dataset.table = JSON.stringify({
        id: t.id || t.table_id || null,
        name: t.name || t.guest_name || '',
        table_number: t.table_number || t.table_no || '',
        party_size: t.party_size || t.pax || '',
        status: t.status || t.reservation_status || '',
        price: parseFloat(t.price) || 0
      });
      actionTd.appendChild(selectBtn);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });
  }

  function showModal() {
    const tablesModal = document.getElementById('tablesModal');
    if (!tablesModal) return;
    tablesModal.classList.remove('hidden');
    tablesModal.setAttribute('tabindex', '-1');
    tablesModal.focus && tablesModal.focus();
  }
  function hideModal() {
    const tablesModal = document.getElementById('tablesModal');
    if (!tablesModal) return;
    tablesModal.classList.add('hidden');
  }

  function fetchTables(useReserved) {
    const base = 'tables/get_reserved_tables.php';
    const type = useReserved ? 'available' : 'reserved';
    const url = base + '?type=' + encodeURIComponent(type);

    function fetchWithTimeout(resource, options = {}, ms = 8000) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), ms);
      return fetch(resource, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(id));
    }

    return fetchWithTimeout(url, { method: 'GET', credentials: 'same-origin' }, 8000)
      .then(async (r) => {
        if (!r.ok) {
          const fall = await fetchWithTimeout(base + '?type=all', { method: 'GET', credentials: 'same-origin' }, 8000).catch(() => null);
          if (fall && fall.ok) return fall.json();
          const txt = await r.text().catch(() => '');
          const e = new Error('HTTP ' + r.status + ' ' + r.statusText);
          e.responseText = txt;
          throw e;
        }
        const text = await r.text();
        try {
          return JSON.parse(text || '[]');
        } catch (err) {
          const fall = await fetchWithTimeout(base + '?type=all', { method: 'GET', credentials: 'same-origin' }, 8000).catch(() => null);
          if (fall && fall.ok) return fall.json();
          const e = new Error('Invalid JSON from server');
          e.responseText = text;
          throw e;
        }
      })
      .catch((err) => {
        const tablesLoading = document.getElementById('tables-loading');
        if (tablesLoading) {
          if (err.name === 'AbortError') {
            tablesLoading.textContent = 'Request timed out — try again or check the server.';
          } else if (err && err.responseText) {
            let t = String(err.responseText);
            try { t = JSON.stringify(JSON.parse(t), null, 2); } catch (e) {}
            tablesLoading.textContent = 'Failed to load tables: ' + (t.length > 1000 ? t.slice(0,1000) + '…' : t);
          } else {
            tablesLoading.textContent = 'Failed to load tables: ' + (err.message || 'Unknown error');
          }
        }
        throw err;
      });
  }

  function applyTablePriceToComputation(price, opts = {}) {
    try {
      if (opts.clear) {
        document.body.dataset.reservedTablePrice = 0;
      } else {
        document.body.dataset.reservedTablePrice = price;
      }
      emitReservedPriceChanged();
    } catch (err) {
      console.error('applyTablePriceToComputation error', err);
    }
  }

  function applySelectedTable(table) {
    selectedTable = table;

    ensureReservedUI();

    const selectedName = document.getElementById('selected-table-name');
    const selectedNumber = document.getElementById('selected-table-number');
    const selectedParty = document.getElementById('selected-table-party');
    const selectedPriceEl = document.getElementById('selected-table-price');
    const selectedSummary = document.getElementById('selected-table-summary');
    const checkbox = document.getElementById('use-reserved-table');
    const openBtn = document.getElementById('open-tables-btn');

    if (selectedName) selectedName.textContent = table.name || '—';
    if (selectedNumber) selectedNumber.textContent = table.table_number || table.id || '';
    if (selectedParty) selectedParty.textContent = table.party_size || '—';
    if (selectedPriceEl) selectedPriceEl.textContent = (parseFloat(table.price) || 0).toFixed(2);
    if (selectedSummary) selectedSummary.style.display = '';

    if (checkbox && !checkbox.checked) checkbox.checked = true;
    if (openBtn) openBtn.disabled = false;

    // hide choose button while a selection is visible
    setChooseButtonVisible(false);

    persistSelectedTable(table);

    const ev = new CustomEvent('table-selected', { detail: table });
    window.dispatchEvent(ev);

    applyTablePriceToComputation(parseFloat(table.price) || 0);
  }

  function clearSelectedTable() {
    selectedTable = null;
    ensureReservedUI();

    const selectedName = document.getElementById('selected-table-name');
    const selectedNumber = document.getElementById('selected-table-number');
    const selectedParty = document.getElementById('selected-table-party');
    const selectedPriceEl = document.getElementById('selected-table-price');
    const selectedSummary = document.getElementById('selected-table-summary');
    const checkbox = document.getElementById('use-reserved-table');
    const openBtn = document.getElementById('open-tables-btn');

    if (selectedName) selectedName.textContent = '—';
    if (selectedNumber) selectedNumber.textContent = '—';
    if (selectedParty) selectedParty.textContent = '—';
    if (selectedPriceEl) selectedPriceEl.textContent = '0.00';
    if (selectedSummary) selectedSummary.style.display = 'none';

    // show choose button again
    setChooseButtonVisible(true);

    const ev = new CustomEvent('table-cleared');
    window.dispatchEvent(ev);

    applyTablePriceToComputation(0, { clear: true });

    if (checkbox) checkbox.checked = false;
    if (openBtn) openBtn.disabled = true;

    persistSelectedTable(null);
  }

  function delegatedClickHandler(e) {
    const chooseBtn = e.target.closest && e.target.closest('#open-tables-btn');
    if (chooseBtn) {
      const checkbox = document.getElementById('use-reserved-table');
      const useReserved = !!(checkbox && checkbox.checked);
      if (!useReserved) {
        console.warn('Please check "Customer has a reserved table" first.');
        chooseBtn.animate && chooseBtn.animate([{ background: '#f8d7da' }, { background: '' }], { duration: 300 });
        return;
      }

      const tablesLoading = document.getElementById('tables-loading');
      if (tablesLoading) {
        tablesLoading.style.display = '';
        tablesLoading.textContent = 'Loading...';
      }
      showModal();
      fetchTables(useReserved)
        .then((data) => renderTablesToModal(data))
        .catch((err) => {
          console.error('Failed to fetch tables', err);
        });
      return;
    }

    const clearBtn = e.target.closest && e.target.closest('#clear-selected-table');
    if (clearBtn) {
      clearSelectedTable();
      return;
    }

    const closeModalBtn = e.target.closest && e.target.closest('#closeTablesModal');
    if (closeModalBtn) {
      hideModal();
      return;
    }

    const selBtn = e.target.closest && e.target.closest('.table-select-btn');
    if (selBtn && selBtn.dataset && selBtn.dataset.table) {
      try {
        const tableObj = JSON.parse(selBtn.dataset.table);
        applySelectedTable(tableObj);
      } catch (err) {
        console.error('Failed to parse table data', err);
      }
      hideModal();
      return;
    }

    if (e.target && e.target.id === 'tablesModal') {
      hideModal();
      return;
    }
  }

  // Hardened observer: debounce, ignore modal/reserved UI mutations, cooldown reapply
  function setupObserver() {
    if (observer) return;
    const orderSection = document.querySelector('.order-section');
    if (!orderSection) return;

    let debounceId = null;
    let lastAppliedAt = 0;
    const DEBOUNCE_MS = 100;
    const REAPPLY_COOLDOWN_MS = 500;

    observer = new MutationObserver((mutationsList) => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        debounceId = null;
        try {
          const hasRelevant = mutationsList.some((m) => {
            const target = m.target;
            if (!target) return true;
            if (target.closest && (target.closest('#tablesModal') || target.closest('.reserved-table-block'))) {
              return false;
            }
            for (let i = 0; i < (m.addedNodes?.length || 0); i++) {
              const n = m.addedNodes[i];
              if (n && n.closest && (n.closest('#tablesModal') || n.closest('.reserved-table-block'))) {
                return false;
              }
            }
            return true;
          });

          if (!hasRelevant) return;

          ensureReservedUI();

          const now = Date.now();
          if (now - lastAppliedAt < REAPPLY_COOLDOWN_MS) return;

          const persisted = restoreSelectedTable();
          if (persisted) {
            selectedTable = persisted;
            const selectedName = document.getElementById('selected-table-name');
            const selectedNumber = document.getElementById('selected-table-number');
            const selectedParty = document.getElementById('selected-table-party');
            const selectedPriceEl = document.getElementById('selected-table-price');
            const selectedSummary = document.getElementById('selected-table-summary');
            const checkbox = document.getElementById('use-reserved-table');
            const openBtn = document.getElementById('open-tables-btn');

            if (selectedName) selectedName.textContent = persisted.name || '—';
            if (selectedNumber) selectedNumber.textContent = persisted.table_number || persisted.id || '—';
            if (selectedParty) selectedParty.textContent = persisted.party_size || '—';
            if (selectedPriceEl) selectedPriceEl.textContent = (parseFloat(persisted.price) || 0).toFixed(2);
            if (selectedSummary) selectedSummary.style.display = '';

            if (checkbox && !checkbox.checked) checkbox.checked = true;
            if (openBtn) openBtn.disabled = false;

            document.body.dataset.reservedTablePrice = (parseFloat(persisted.price) || 0);
            emitReservedPriceChanged();
          }

          lastAppliedAt = Date.now();
        } catch (err) {
          console.error('observer handler error', err);
        }
      }, DEBOUNCE_MS);
    });

    observer.observe(orderSection, { childList: true, subtree: true });
  }

  function init() {
    // Clear persisted selection if this page load is a reload (so it won't survive Ctrl+F5/hard refresh)
    clearPersistedOnReloadIfNeeded();

    ensureReservedUI();
    document.removeEventListener('click', delegatedClickHandler);
    document.addEventListener('click', delegatedClickHandler);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') hideModal();
    });
    setupObserver();

    const persisted = restoreSelectedTable();
    if (persisted) {
      ensureReservedUI();
      selectedTable = persisted;
      const selectedName = document.getElementById('selected-table-name');
      const selectedNumber = document.getElementById('selected-table-number');
      const selectedParty = document.getElementById('selected-table-party');
      const selectedPriceEl = document.getElementById('selected-table-price');
      const selectedSummary = document.getElementById('selected-table-summary');
      const checkbox = document.getElementById('use-reserved-table');
      const openBtn = document.getElementById('open-tables-btn');

      if (selectedName) selectedName.textContent = persisted.name || '—';
      if (selectedNumber) selectedNumber.textContent = persisted.table_number || persisted.id || '—';
      if (selectedParty) selectedParty.textContent = persisted.party_size || '—';
      if (selectedPriceEl) selectedPriceEl.textContent = (parseFloat(persisted.price) || 0).toFixed(2);
      if (selectedSummary) selectedSummary.style.display = '';

      if (checkbox && !checkbox.checked) checkbox.checked = true;
      if (openBtn) openBtn.disabled = false;

      // hide choose button while persisted selection is applied on this load
      setChooseButtonVisible(false);

      document.body.dataset.reservedTablePrice = (parseFloat(persisted.price) || 0);
      emitReservedPriceChanged();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.tablesSelect = window.tablesSelect || {};
  window.tablesSelect.getSelectedTable = () => selectedTable;
  window.tablesSelect.clearSelectedTable = clearSelectedTable;
  window.tablesSelect.ensureReservedUI = ensureReservedUI;
})();