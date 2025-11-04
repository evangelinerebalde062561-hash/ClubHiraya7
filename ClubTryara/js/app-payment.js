/**
 * app-payments.js
 * - Payment flow and sale-saving module (non-invasive)
 * - Place at ClubTryara/js/app-payments.js and include after app.js and tables-select.js.
 *
 * Features:
 * - Payment modal: Cash / GCash / Bank-Card
 * - Save sale to api/save_sale.php (new endpoint) and call api/update_stock.php when proceeding
 * - Print receipt via ../clubtryara/php/print_receipt.php after save
 * - Exposes openPaymentModal on window.appPayments.openPaymentModal
 * - Defensive: wires Proceed button to open the modal even if other handlers exist
 */

(function () {
  const SAVE_ENDPOINT = 'api/save_sale.php';
  const UPDATE_STOCK_ENDPOINT = 'api/update_stock.php';
  const PRINT_ENDPOINT = '../clubtryara/php/print_receipt.php';

  function el(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    return wrapper.firstChild;
  }

  function toast(msg, opts = {}) {
    const d = document.createElement('div');
    d.className = 'app-toast';
    d.textContent = msg;
    d.style.position = 'fixed';
    d.style.right = '18px';
    d.style.bottom = '18px';
    d.style.padding = '10px 14px';
    d.style.background = 'rgba(0,0,0,0.8)';
    d.style.color = '#fff';
    d.style.borderRadius = '8px';
    d.style.zIndex = 99999;
    d.style.fontWeight = 700;
    d.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
    document.body.appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity 300ms'; d.style.opacity = '0'; }, opts.duration || 2400);
    setTimeout(() => { d.remove(); }, (opts.duration || 2400) + 350);
  }

  // safe helpers to integrate with existing app
  function safeComputeNumbers() {
    try { if (typeof computeNumbers === 'function') return computeNumbers(); } catch (e) {}
    return { subtotal:0, serviceCharge:0, tax:0, discountAmount:0, tablePrice: parseFloat(document.body.dataset.reservedTablePrice||0)||0, payable:0 };
  }
  function safeGetOrder() {
    try { if (Array.isArray(window.order)) return window.order; } catch (e) {}
    return [];
  }
  function safeGetReserved() {
    try {
      if (window.tablesSelect && typeof window.tablesSelect.getSelectedTable === 'function') return window.tablesSelect.getSelectedTable();
      const raw = sessionStorage.getItem('clubtryara:selected_table_v1');
      if (raw) return JSON.parse(raw);
    } catch (e){}
    return null;
  }

  // Payment modal HTML
  const paymentModalHtml = `
    <div class="modal" id="paymentModal" role="dialog" aria-modal="true" tabindex="-1" style="display:none;">
      <div class="modal-content" style="max-width:520px;padding:18px;box-sizing:border-box;">
        <button class="close-btn" id="paymentClose" aria-label="Close">&times;</button>
        <h3 id="paymentTitle">Payment</h3>
        <div id="paymentSummary" style="margin-bottom:12px;font-size:14px;color:#222;"></div>
        <div style="margin-bottom:8px;">
          <label style="display:block;margin-bottom:6px;font-weight:700;">Payment method</label>
          <div style="display:flex;gap:8px;">
            <button type="button" class="pay-method" data-method="cash">Cash</button>
            <button type="button" class="pay-method" data-method="gcash">GCash</button>
            <button type="button" class="pay-method" data-method="bankcard">Bank/Card</button>
          </div>
        </div>
        <form id="paymentForm" style="margin-top:12px;">
          <div id="cashNote" style="display:none;margin-bottom:8px;">
            <label>Amount Received (optional)</label>
            <input type="number" name="amount_received" id="amountReceived" style="width:100%;padding:8px;margin-top:6px;" />
          </div>
          <div id="gcashFields" style="display:none;margin-bottom:8px;">
            <label>GCash Number</label>
            <input type="text" name="gcash_number" id="gcashNumber" placeholder="09xxxxxxxxx" style="width:100%;padding:8px;margin-top:6px;" />
            <label style="display:block;margin-top:8px;">GCash Reference (Txn ID)</label>
            <input type="text" name="gcash_ref" id="gcashRef" style="width:100%;padding:8px;margin-top:6px;" />
          </div>
          <div id="bankCardFields" style="display:none;margin-bottom:8px;">
            <label>Bank or Card (last4)</label>
            <input type="text" name="bank_card" id="bankCard" placeholder="Bank or Card last4" style="width:100%;padding:8px;margin-top:6px;" />
            <label style="display:block;margin-top:8px;">Reference / Auth</label>
            <input type="text" name="bank_ref" id="bankRef" style="width:100%;padding:8px;margin-top:6px;" />
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
            <button type="button" id="paymentCancel" class="btn-link">Cancel</button>
            <button type="button" id="paymentSave" class="hold-btn">Save & Print</button>
          </div>
        </form>
      </div>
    </div>
  `;
  const modalNode = el(paymentModalHtml);
  document.body.appendChild(modalNode);

  const $modal = document.getElementById('paymentModal');
  const $paymentTitle = document.getElementById('paymentTitle');
  const $paymentSummary = document.getElementById('paymentSummary');
  const $paymentForm = document.getElementById('paymentForm');
  const $cashNote = document.getElementById('cashNote');
  const $gcashFields = document.getElementById('gcashFields');
  const $bankCardFields = document.getElementById('bankCardFields');
  const $paymentClose = document.getElementById('paymentClose');
  const $paymentCancel = document.getElementById('paymentCancel');
  const $paymentSave = document.getElementById('paymentSave');
  let currentMethod = 'cash';
  let currentFlow = 'billout';

  function showModal(){ $modal.style.display = ''; $modal.focus && $modal.focus(); }
  function hideModal(){ $modal.style.display = 'none'; }

  function updateSummary(){
    const nums = safeComputeNumbers();
    const reserved = safeGetReserved();
    const rtext = reserved ? `${reserved.name || '—'} (Party: ${reserved.party_size || '—'})` : 'No reservation';
    $paymentSummary.innerHTML = `<div><strong>Payable:</strong> ₱${(nums.payable||0).toFixed(2)}</div><div style="margin-top:6px;"><strong>Reservation:</strong> ${rtext}</div>`;
  }

  document.querySelectorAll('#paymentModal .pay-method').forEach(btn=>{
    btn.addEventListener('click', ()=> selectMethod(btn.dataset.method));
  });

  function selectMethod(method){
    currentMethod = method;
    $cashNote.style.display = method === 'cash' ? '' : 'none';
    $gcashFields.style.display = method === 'gcash' ? '' : 'none';
    $bankCardFields.style.display = method === 'bankcard' ? '' : 'none';
    document.querySelectorAll('#paymentModal .pay-method').forEach(b=> b.style.opacity = b.dataset.method===method ? '1' : '0.6');
  }

  $paymentClose.addEventListener('click', hideModal);
  $paymentCancel.addEventListener('click', hideModal);

  function openPaymentModal(flow='billout'){
    currentFlow = flow;
    $paymentTitle.textContent = flow==='billout' ? 'Bill Out (Cash / Print)' : 'Proceed (Payment)';
    updateSummary();
    selectMethod('cash');
    showModal();
  }

  function validatePayment(){
    if (currentMethod==='gcash'){
      const num = document.getElementById('gcashNumber').value.trim();
      const ref = document.getElementById('gcashRef').value.trim();
      if (!num||!ref){ alert('Enter GCash number and reference'); return false; }
    } else if (currentMethod==='bankcard'){
      const b = document.getElementById('bankCard').value.trim();
      const r = document.getElementById('bankRef').value.trim();
      if (!b||!r){ alert('Enter bank/card and reference'); return false; }
    }
    return true;
  }

  async function saveSale(payload){
    const res = await fetch(SAVE_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if (!res.ok){
      const t = await res.text().catch(()=>null);
      throw new Error('Save failed: '+res.status+' '+res.statusText + (t ? ' — '+t.slice(0,200):''));
    }
    return res.json();
  }

  async function updateStock(payload){
    const res = await fetch(UPDATE_STOCK_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if (!res.ok){
      const t = await res.text().catch(()=>null);
      throw new Error('Update stock failed: '+res.status+' '+res.statusText + (t ? ' — '+t.slice(0,200):''));
    }
    return res.json();
  }

  function printReceipt(payload){
    const w = window.open('', '_blank', 'width=900,height=900');
    if (!w){ alert('Allow popups for printing'); return; }
    const form = document.createElement('form');
    form.method='POST'; form.action = PRINT_ENDPOINT; form.target = w.name;
    const cartInput = document.createElement('input'); cartInput.type='hidden'; cartInput.name='cart'; cartInput.value = JSON.stringify(payload.cart||[]);
    const totalsInput = document.createElement('input'); totalsInput.type='hidden'; totalsInput.name='totals'; totalsInput.value = JSON.stringify(payload.totals||{});
    const reservedInput = document.createElement('input'); reservedInput.type='hidden'; reservedInput.name='reserved'; reservedInput.value = JSON.stringify(payload.reserved||{});
    const paymentInput = document.createElement('input'); paymentInput.type='hidden'; paymentInput.name='payment'; paymentInput.value = JSON.stringify(payload.payment||{});
    form.appendChild(cartInput); form.appendChild(totalsInput); form.appendChild(reservedInput); form.appendChild(paymentInput);
    document.body.appendChild(form); form.submit(); document.body.removeChild(form);
  }

  async function handleSaveAndPrint(flow){
    if (flow==='proceed' && currentMethod!=='cash' && !validatePayment()) return;
    const cart = safeGetOrder().map(i=>({ id:i.id, name:i.name, price:i.price, qty:i.qty }));
    if (!cart.length){ alert('Cart is empty'); return; }
    const totals = safeComputeNumbers();
    const reserved = safeGetReserved();
    const payment = { method: currentMethod };
    if (currentMethod==='cash'){ payment.amount_received = parseFloat(document.getElementById('amountReceived')?.value||0)||0; }
    else if (currentMethod==='gcash'){ payment.gcash_number = document.getElementById('gcashNumber').value.trim(); payment.gcash_ref = document.getElementById('gcashRef').value.trim(); }
    else if (currentMethod==='bankcard'){ payment.bank_card = document.getElementById('bankCard').value.trim(); payment.bank_ref = document.getElementById('bankRef').value.trim(); }

    const salePayload = {
      cart, totals, reserved: reserved||null, payment,
      meta: { flow, cashier: (window.APP && window.APP.cashierName) || (window.CASHIER_NAME||null), note: (window.noteValue||''), timestamp: new Date().toISOString() }
    };

    try {
      const btnBill = document.getElementById('billOutBtn');
      const btnProceed = document.getElementById('proceedBtn');
      if (btnBill) btnBill.disabled = true;
      if (btnProceed) btnProceed.disabled = true;
      $paymentSave.disabled = true;

      const saved = await saveSale(salePayload);
      if (!saved || !saved.success) throw new Error((saved && saved.message) ? saved.message : 'Failed to save sale');

      if (flow==='proceed'){
        const stockPayload = { items: cart.map(i=>({ id:i.id, qty:i.qty })), totals, reserved: reserved||null };
        await updateStock(stockPayload);
      }

      const printPayload = Object.assign({}, salePayload, { saleId: saved.saleId || null });
      printReceipt(printPayload);

      toast('Sale saved' + (saved.saleId ? ' (ID: '+saved.saleId+')' : ''));

      if (Array.isArray(window.order)) window.order.length = 0;
      try { if (typeof renderOrder === 'function') renderOrder(); } catch(e){}
      hideModal();
    } catch (err){
      console.error('Save and print failed', err);
      alert('Failed to save sale: ' + (err.message || err));
    } finally {
      const btnBill = document.getElementById('billOutBtn');
      const btnProceed = document.getElementById('proceedBtn');
      if (btnBill) btnBill.disabled = false;
      if (btnProceed) btnProceed.disabled = false;
      $paymentSave.disabled = false;
    }
  }

  $paymentSave.addEventListener('click', ()=> handleSaveAndPrint(currentFlow));

  // wire buttons
  function wirePaymentButtons(){
    const bill = document.getElementById('billOutBtn');
    const proceed = document.getElementById('proceedBtn');
    if (bill){ bill.removeEventListener('click', onBillClick); bill.addEventListener('click', onBillClick); }
    if (proceed){ proceed.removeEventListener('click', onProceedClick); proceed.addEventListener('click', onProceedClick); }
  }
  function onBillClick(e){ e.preventDefault(); openPaymentModal('billout'); }
  function onProceedClick(e){ e.preventDefault(); openPaymentModal('proceed'); }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wirePaymentButtons); else wirePaymentButtons();
  window.addEventListener('reserved-price-changed', ()=> setTimeout(wirePaymentButtons,0));

  // Expose API for defensive wiring
  window.appPayments = window.appPayments || {};
  window.appPayments.openPaymentModal = openPaymentModal;

  // Fallback: listen to custom event 'open-payment-modal'
  window.addEventListener('open-payment-modal', ev=>{
    try{
      const flow = ev && ev.detail && ev.detail.flow ? ev.detail.flow : 'proceed';
      openPaymentModal(flow);
    }catch(e){ console.warn('open-payment-modal handler failed', e); }
  });

  // Defensive ensure: wire Proceed to open modal even if other code prevented our wiring earlier
  (function defensiveWireProceed(){
    const proceed = document.getElementById('proceedBtn');
    if (!proceed) return;
    proceed.addEventListener('click', function defensiveOpen(e){
      // If modal already visible, let existing handler run; otherwise open it.
      if ($modal.style.display && $modal.style.display !== 'none') return;
      e.preventDefault();
      openPaymentModal('proceed');
    });
  })();

})();