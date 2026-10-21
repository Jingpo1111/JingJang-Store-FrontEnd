// ==========================================================================
// JingJang Store — Dedicated Payment & KHQR Logic (payment.js)
// Auto-generates official ABA & ACLEDA KHQR standees by last price
// ==========================================================================

let currentBank = 'aba';
let currentCurrency = 'USD';
let currentPaymentData = null;
let receiptBase64 = '';
let pendingOrderData = null;

// Helper: Resolve active API Base URL
function getApiBase() {
  if (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) {
    return CONFIG.API_BASE;
  }
  const isLocal = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'file:';
  return isLocal ? 'http://localhost:3000' : 'https://api.jingjangstore.com';
}

// 1. Initialize Page and Pending Order Data
function initPaymentPage() {
  let saved = sessionStorage.getItem('jj_pending_checkout') || localStorage.getItem('jj_pending_checkout');
  if (saved) {
    try {
      pendingOrderData = JSON.parse(saved);
    } catch (e) {
      console.warn("Could not parse saved checkout:", e);
    }
  }

  // Fallback: If visited directly without pending session, build from active cart
  if (!pendingOrderData || !pendingOrderData.total || Number(pendingOrderData.total) <= 0) {
    let localCart = [];
    try {
      localCart = JSON.parse(localStorage.getItem('cart') || '[]');
    } catch (e) { }

    if (!localCart || localCart.length === 0) {
      alert("No pending order or items in cart. Returning to shop.");
      window.location.href = 'index.html';
      return;
    }

    const subtotal = localCart.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 1), 0);
    pendingOrderData = {
      userid: localStorage.getItem('jj_userId') || 'GUEST',
      name: localStorage.getItem('jj_username') || 'Valued Customer',
      phone: 'Provided upon delivery',
      address: 'Phnom Penh, Cambodia',
      note: 'None',
      subtotal: subtotal.toFixed(2),
      promo_code: null,
      discount_amount: '0.00',
      total: subtotal.toFixed(2),
      items: localCart
    };
  }

  // Render Customer & Order details in right panel
  renderOrderSummaryUI();

  // Generate the authentic KHQR for both ABA & ACLEDA
  fetchAndRenderKHQR();
}

// 2. Render Order Summary in UI
function renderOrderSummaryUI() {
  if (!pendingOrderData) return;

  const totalNum = parseFloat(pendingOrderData.total) || 0;
  const subtotalNum = parseFloat(pendingOrderData.subtotal) || totalNum;
  const discountNum = parseFloat(pendingOrderData.discount_amount) || 0;

  const totalEl = document.getElementById('pay-summary-total');
  const subtotalEl = document.getElementById('pay-summary-subtotal');
  const discountRow = document.getElementById('pay-discount-row');
  const discountEl = document.getElementById('pay-summary-discount');
  const promoCodeEl = document.getElementById('pay-promo-code-name');

  const nameEl = document.getElementById('cust-summary-name');
  const phoneEl = document.getElementById('cust-summary-phone');
  const addressEl = document.getElementById('cust-summary-address');
  const itemsCountEl = document.getElementById('pay-summary-items-count');

  if (totalEl) totalEl.innerText = `$${totalNum.toFixed(2)}`;
  if (subtotalEl) subtotalEl.innerText = `$${subtotalNum.toFixed(2)}`;

  if (discountNum > 0 && discountRow) {
    discountRow.style.display = 'flex';
    if (discountEl) discountEl.innerText = `-$${discountNum.toFixed(2)}`;
    if (promoCodeEl) promoCodeEl.innerText = pendingOrderData.promo_code || 'PROMO';
  } else if (discountRow) {
    discountRow.style.display = 'none';
  }

  if (nameEl) nameEl.innerText = pendingOrderData.name || 'Customer';
  if (phoneEl) phoneEl.innerText = pendingOrderData.phone || '-';
  if (addressEl) addressEl.innerText = pendingOrderData.address || '-';

  if (itemsCountEl && pendingOrderData.items) {
    const totalQty = pendingOrderData.items.reduce((s, i) => s + (parseInt(i.quantity, 10) || 1), 0);
    itemsCountEl.innerText = `${totalQty} ${totalQty === 1 ? 'item' : 'items'}`;
  }
}

// Pure client-side EMVCo KHQR builder (guarantees dynamic QR with amount even if offline)
function clientCRC16(s) {
  let c = 0xFFFF;
  for (const ch of s) {
    c ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) {
      c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
    }
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

function buildClientABAKHQR(amount, currency = 'USD') {
  const len = s => String(s.length).padStart(2, '0');
  const isUSD = currency.toUpperCase() === 'USD';
  const cur = isUSD ? '840' : '116';
  const amt = isUSD ? Number(amount).toFixed(2) : String(Math.round(amount));

  const bankId = 'abaakhppxxx@abaa';
  const accountNumber = '010777270';
  const accountDual = '010777268';
  const p2pToken = '6C87B76C22F9';
  const beneficiaryName = 'JINGPO PHAI';
  const merchantCity = 'Phnom Penh';

  const tag29Data = '00' + len(bankId) + bankId + '01' + len(accountNumber) + accountNumber + '0208ABA Bank';
  const tag40Data = '0006abaP2P0112' + p2pToken + '02' + len(accountNumber) + accountNumber + '03' + len(accountDual) + accountDual + '0404Dual';
  const poi = Number(amount) > 0 ? '12' : '11';

  let s = '0002010102' + poi
    + '29' + len(tag29Data) + tag29Data
    + '40' + len(tag40Data) + tag40Data
    + '52045999'
    + '5303' + cur;

  if (Number(amount) > 0) {
    s += '54' + len(amt) + amt;
  }

  s += '5802KH'
    + '59' + len(beneficiaryName) + beneficiaryName
    + '6010' + merchantCity
    + '6304';

  return s + clientCRC16(s);
}

function buildClientACLEDAPayload(amount, currency = 'USD', billNumber = '') {
  const len = s => String(s.length).padStart(2, '0');
  const isUSD = currency.toUpperCase() === 'USD';
  const cur = isUSD ? '840' : '116';
  const amt = isUSD ? Number(amount).toFixed(2) : String(Math.round(amount));
  const sanitizedBill = String(billNumber || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
  const serviceTag = '016441653';
  const extra = (sanitizedBill ? '01' + len(sanitizedBill) + sanitizedBill : '') + '0209' + serviceTag;

  const bankId = 'khqr@aclb';
  const accountNumber = '011185517829743';
  const beneficiaryName = 'PHAI JINGPO';
  const merchantCity = 'Phnom Penh';

  const tag29Data = '00' + len(bankId) + bankId + '01' + len(accountNumber) + accountNumber + '0206ACLEDA';
  const poi = Number(amount) > 0 ? '12' : '11';

  let s = '0002010102' + poi
    + '29' + len(tag29Data) + tag29Data
    + '391300042CCY01014'
    + '52045999'
    + '5303' + cur;

  if (Number(amount) > 0) {
    s += '54' + len(amt) + amt;
  }

  s += '5802KH'
    + '59' + len(beneficiaryName) + beneficiaryName
    + '6010' + merchantCity
    + '62' + len(extra) + extra
    + '6304';

  return s + clientCRC16(s);
}

// 3. Fetch and Render KHQR Standee Details
async function fetchAndRenderKHQR() {
  if (!pendingOrderData) return;

  const amountVal = parseFloat(pendingOrderData.total) || 0;
  if (amountVal <= 0) return;

  // Update Standee Text Amounts immediately
  const dispAbaAmount = document.getElementById('disp-amount-num-aba');
  const dispAbaCurr = document.getElementById('disp-amount-curr-aba');
  const dispAcledaAmount = document.getElementById('disp-amount-num-acleda');

  if (dispAbaAmount) dispAbaAmount.textContent = amountVal.toFixed(2);
  if (dispAbaCurr) dispAbaCurr.textContent = 'USD';
  if (dispAcledaAmount) dispAcledaAmount.textContent = `${amountVal.toFixed(2)} ដុល្លារ`;

  // Show Loading Spinner on standees
  const loadingAba = document.getElementById('loading-aba');
  const loadingAcleda = document.getElementById('loading-acleda');
  if (loadingAba) loadingAba.style.display = 'flex';
  if (loadingAcleda) loadingAcleda.style.display = 'flex';

  const apiBase = getApiBase();
  try {
    const response = await fetch(`${apiBase}/api/qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountVal,
        currency: 'USD',
        bill_number: `JJ-${Date.now().toString().slice(-6)}`
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    currentPaymentData = data;

    // Apply Pure QR Matrix Images
    const qrImgAba = document.getElementById('qr-img-aba');
    const qrImgAcleda = document.getElementById('qr-img-acleda');
    if (qrImgAba) qrImgAba.src = data.aba.image;
    if (qrImgAcleda) qrImgAcleda.src = data.acleda.image;

  } catch (err) {
    console.warn('Backend /api/qr unreachable, generating dynamic KHQR with exact price:', err);
    // Instant dynamic fallback: calculate EMVCo KHQR with exact amount ($4.00)
    const abaPayload = buildClientABAKHQR(amountVal, 'USD');
    const acledaPayload = buildClientACLEDAPayload(amountVal, 'USD', `JJ-${Date.now().toString().slice(-6)}`);

    const abaQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=2&ecc=H&data=${encodeURIComponent(abaPayload)}`;
    const acledaQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=2&ecc=H&data=${encodeURIComponent(acledaPayload)}`;

    currentPaymentData = {
      amount: amountVal,
      currency: 'USD',
      aba: {
        bank: 'ABA Bank',
        text: abaPayload,
        image: abaQrUrl
      },
      acleda: {
        bank: 'ACLEDA Bank',
        text: acledaPayload,
        image: acledaQrUrl
      }
    };

    const qrImgAba = document.getElementById('qr-img-aba');
    const qrImgAcleda = document.getElementById('qr-img-acleda');
    if (qrImgAba) qrImgAba.src = abaQrUrl;
    if (qrImgAcleda) qrImgAcleda.src = acledaQrUrl;
  } finally {
    if (loadingAba) loadingAba.style.display = 'none';
    if (loadingAcleda) loadingAcleda.style.display = 'none';
  }
}

// 4. Switch Between ABA and ACLEDA Standees
function switchBank(bank) {
  currentBank = (bank === 'ac' || bank === 'acleda') ? 'acleda' : 'aba';

  const tabAba = document.getElementById('tab-btn-aba');
  const tabAcleda = document.getElementById('tab-btn-acleda');
  const posterAba = document.getElementById('poster-aba-wrapper');
  const posterAcleda = document.getElementById('poster-acleda-wrapper');

  if (tabAba) tabAba.classList.toggle('active', currentBank === 'aba');
  if (tabAcleda) tabAcleda.classList.toggle('active', currentBank === 'acleda');

  if (posterAba) posterAba.style.display = currentBank === 'aba' ? 'flex' : 'none';
  if (posterAcleda) posterAcleda.style.display = currentBank === 'acleda' ? 'flex' : 'none';
}

// 5. Download Standee Poster (High-Res 3x PNG via html2canvas)
async function downloadPoster(bank) {
  const targetBank = bank || currentBank;
  const posterId = targetBank === 'aba' ? 'poster-aba' : 'poster-acleda';
  const posterElem = document.getElementById(posterId);
  if (!posterElem) return;

  const btn = document.getElementById(`btn-dl-standee-${targetBank}`);
  const originalText = btn ? btn.innerHTML : '';
  if (btn) btn.innerHTML = '<span>⏳ Generating Exact Standee PNG...</span>';

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    if (typeof html2canvas === 'undefined') {
      throw new Error("html2canvas library not loaded. Falling back to QR download.");
    }

    const canvas = await html2canvas(posterElem, {
      scale: 3, // Crisp 3x print resolution (1140px width)
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false
    });

    const dataUrl = canvas.toDataURL('image/png');
    const dlLink = document.createElement('a');
    dlLink.download = `JingJangStore-${targetBank.toUpperCase()}-Standee.png`;
    dlLink.href = dataUrl;
    document.body.appendChild(dlLink);
    dlLink.click();
    document.body.removeChild(dlLink);
  } catch (err) {
    console.warn('html2canvas standee download issue:', err);
    // Fallback directly to QR download
    downloadQROnly(targetBank);
  } finally {
    if (btn) btn.innerHTML = originalText;
  }
}

// 6. Download Pure QR Code Only
function downloadQROnly(bank) {
  const targetBank = bank || currentBank;
  let imgSrc = '';

  if (currentPaymentData) {
    imgSrc = targetBank === 'aba' ? currentPaymentData.aba.image : currentPaymentData.acleda.image;
  } else {
    const qrImgEl = document.getElementById(targetBank === 'aba' ? 'qr-img-aba' : 'qr-img-acleda');
    if (qrImgEl) imgSrc = qrImgEl.src;
  }

  if (!imgSrc) {
    alert("QR code image is not loaded yet. Please wait a moment.");
    return;
  }

  const dlLink = document.createElement('a');
  dlLink.download = `JingJangStore-${targetBank.toUpperCase()}-KHQR.png`;
  dlLink.href = imgSrc;
  document.body.appendChild(dlLink);
  dlLink.click();
  document.body.removeChild(dlLink);
}

// 7. Receipt Screenshot Upload & Preview
function previewReceipt(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert("Receipt image exceeds 5MB limit. Please upload a smaller file.");
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function () {
    const preview = document.getElementById('receipt-preview');
    const previewWrap = document.getElementById('receipt-preview-wrap');
    const placeholder = document.getElementById('receipt-placeholder');

    if (preview) preview.src = reader.result;
    if (previewWrap) previewWrap.style.display = 'flex';
    if (placeholder) placeholder.style.display = 'none';

    receiptBase64 = reader.result;
  };
  reader.readAsDataURL(file);
}

function removeReceipt(e) {
  if (e) e.stopPropagation();
  const input = document.getElementById('receipt-upload');
  const previewWrap = document.getElementById('receipt-preview-wrap');
  const placeholder = document.getElementById('receipt-placeholder');

  if (input) input.value = '';
  if (previewWrap) previewWrap.style.display = 'none';
  if (placeholder) placeholder.style.display = 'flex';
  receiptBase64 = '';
}

// 8. Confirm Order & Submit Receipt to Backend (/order)
async function confirmOrder() {
  if (!pendingOrderData) {
    alert("Session expired. Please restart checkout.");
    window.location.href = 'checkout.html';
    return;
  }

  if (!receiptBase64) {
    alert("Please upload your payment receipt screenshot before confirming your order.");
    document.getElementById('receipt-upload-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const confirmBtn = document.getElementById('btn-confirm-order');
  const btnText = document.getElementById('confirm-btn-text');
  const btnSpinner = document.getElementById('confirm-btn-spinner');

  if (btnText) btnText.innerText = 'Submitting Order...';
  if (btnSpinner) btnSpinner.style.display = 'inline-block';
  if (confirmBtn) confirmBtn.disabled = true;

  const apiBase = getApiBase();
  const API_URL = `${apiBase}/order`;

  const orderPayload = {
    userid: pendingOrderData.userid || localStorage.getItem('jj_userId') || 'GUEST',
    name: pendingOrderData.name || '',
    Phone: pendingOrderData.phone || '',
    Address: pendingOrderData.address || '',
    Note: pendingOrderData.note || 'None',
    Total: pendingOrderData.total || '0.00',
    subtotal: pendingOrderData.subtotal || pendingOrderData.total || '0.00',
    promo_code: pendingOrderData.promo_code || null,
    discount_amount: pendingOrderData.discount_amount || '0.00',
    bank_method: currentBank === 'acleda' ? 'ACLEDA Bank' : 'ABA Bank',
    Items: JSON.stringify(pendingOrderData.items || []),
    Receipt: receiptBase64
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Failed to submit order');
    }

    const orderId = result.orderId || ('JJ-' + Math.floor(100000 + Math.random() * 900000));

    // Clear cart and checkout session
    localStorage.removeItem('cart');
    sessionStorage.removeItem('jj_pending_checkout');
    localStorage.removeItem('jj_pending_checkout');

    if (typeof updateCartUI === 'function') {
      updateCartUI();
    }

    // Show celebratory in-page success modal
    showOrderSuccessModal(orderId);

  } catch (err) {
    console.error('Order error:', err);
    alert('Could not submit order: ' + err.message + '. Please check your connection and try again.');
  } finally {
    if (btnText) btnText.innerText = 'Confirm Order & Submit Receipt';
    if (btnSpinner) btnSpinner.style.display = 'none';
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

// 9. Order Success Modal
function showOrderSuccessModal(orderId) {
  const modal = document.getElementById('order-success-modal');
  const idEl = document.getElementById('success-order-id');
  if (idEl) idEl.innerText = orderId;
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closeOrderSuccessModal() {
  const modal = document.getElementById('order-success-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  window.location.href = 'index.html';
}

// Initialize on page ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initPaymentPage();
} else {
  document.addEventListener('DOMContentLoaded', initPaymentPage);
}
