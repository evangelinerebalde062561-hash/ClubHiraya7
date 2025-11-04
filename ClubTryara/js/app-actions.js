/**
 * app-actions.js (trimmed)
 * - Non-invasive helper module.
 * - Removed the old "proceed" immediate update logic so the new payment flow (app-payments.js)
 *   handles Proceed and Bill Out behavior.
 * - This file no longer wires the Proceed button to call api/update_stock.php directly.
 *
 * Keep this file present so any existing references to app-actions still find it,
 * but all proceed logic moved to app-payments.js.
 */

(function () {
  // Keep the same PRINT_ENDPOINT in case external code uses this module in future.
  const PRINT_ENDPOINT = '../clubtryara/php/print_receipt.php';

  function gatherCartForPayload() {
    try {
      if (Array.isArray(window.order)) return window.order.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty }));
    } catch (e) { /* ignore */ }
    return [];
  }

  function getReservedTable() {
    try {
      if (window.tablesSelect && typeof window.tablesSelect.getSelectedTable === 'function') {
        return window.tablesSelect.getSelectedTable();
      }
      const raw = sessionStorage.getItem('clubtryara:selected_table_v1');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  // Minimal helper that prepares the print form and opens the print window.
  // This is used by app-payments.js after saving a sale, but exported here in case other modules call it.
  async function preparePrintAndOpen(cart, totals, reserved, meta = {}) {
    try {
      const w = window.open('', '_blank', 'width=800,height=900');
      if (!w) {
        alert('Please allow popups for printing.');
        return;
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = PRINT_ENDPOINT;
      form.target = w.name;

      const cartInput = document.createElement('input');
      cartInput.type = 'hidden';
      cartInput.name = 'cart';
      cartInput.value = JSON.stringify(cart || []);
      form.appendChild(cartInput);

      const totalsInput = document.createElement('input');
      totalsInput.type = 'hidden';
      totalsInput.name = 'totals';
      totalsInput.value = JSON.stringify(totals || {});
      form.appendChild(totalsInput);

      const reservedInput = document.createElement('input');
      reservedInput.type = 'hidden';
      reservedInput.name = 'reserved';
      reservedInput.value = JSON.stringify(reserved || {});
      form.appendChild(reservedInput);

      const metaInput = document.createElement('input');
      metaInput.type = 'hidden';
      metaInput.name = 'meta';
      metaInput.value = JSON.stringify(meta || {});
      form.appendChild(metaInput);

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    } catch (err) {
      console.error('preparePrintAndOpen error', err);
      alert('Failed to prepare print: ' + (err.message || err));
    }
  }

  // Expose minimal helpers on window for other modules to use
  window.appActions = window.appActions || {};
  window.appActions.preparePrintAndOpen = preparePrintAndOpen;
  window.appActions.getReservedTable = getReservedTable;
  window.appActions.gatherCartForPayload = gatherCartForPayload;

  // IMPORTANT: Do NOT wire the Proceed button here any more.
  // The new payment flow (app-payments.js) will wire Bill Out and Proceed and handle saving/updating/printing.
})();