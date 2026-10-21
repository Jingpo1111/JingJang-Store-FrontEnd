// ==========================================================================
// JingJang Store — In-Page Checkout & Payment Logic (checkout.js)
// Dynamic KHQR Payment Generation for ABA Bank & ACLEDA Bank (Auto by Last Price)
// ==========================================================================

let receiptBase64 = "";
let receiptMimeType = "";
let selectedBankKey = "aba";
let appliedPromo = null;
let currentPaymentData = null;
let qrFetchAbortController = null;

// Helper: Resolve the active API base URL
function getApiBase() {
    if (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) {
        return CONFIG.API_BASE;
    }
    const isLocal = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.protocol === 'file:';
    return isLocal ? 'http://localhost:3000' : 'https://api.jingjangstore.com';
}

// Helper: Calculate total cart subtotal
function getCartSubtotal() {
    if (typeof cart === 'undefined' || !cart || !Array.isArray(cart)) return 0;
    return cart.reduce((sum, item) => {
        const qty = parseInt(item.quantity, 10) || 0;
        const price = parseFloat(item.price) || 0;
        return sum + (price * qty);
    }, 0);
}

// Helper: Compute final total amount after promo discounts
function getCheckoutFinalTotal() {
    const subtotal = getCartSubtotal();
    if (!appliedPromo) return subtotal;

    let discount = 0;
    if (appliedPromo.discountType === 'percentage') {
        discount = (subtotal * appliedPromo.discountValue) / 100;
        if (appliedPromo.maxDiscount) {
            discount = Math.min(discount, appliedPromo.maxDiscount);
        }
    } else {
        discount = Math.min(appliedPromo.discountValue, subtotal);
    }
    discount = Math.round(discount * 100) / 100;
    return Math.max(0, Math.round((subtotal - discount) * 100) / 100);
}

// Helper: Re-calculate and update Checkout pricing display & trigger auto QR generation
function updateCheckoutPricingUI() {
    const subtotal = getCartSubtotal();
    const checkoutTotalEl = document.getElementById('checkout-total-price');
    const breakdownEl = document.getElementById('checkout-promo-breakdown');
    const subtotalEl = document.getElementById('checkout-subtotal-price');
    const discountEl = document.getElementById('checkout-discount-amount');
    const promoLabelEl = document.getElementById('checkout-promo-label');
    const promoCodeNameEl = document.getElementById('checkout-promo-code-name');
    const savingsPillEl = document.getElementById('checkout-savings-pill');
    const savingsTextEl = document.getElementById('checkout-savings-text');
    const itemsCountEl = document.getElementById('checkout-items-count');

    // Update items count in order summary header if present
    if (itemsCountEl) {
        const count = (typeof cart !== 'undefined' && cart) ? cart.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0) : 0;
        itemsCountEl.innerText = `${count} ${count === 1 ? 'item' : 'items'}`;
    }

    let finalTotal = subtotal;

    if (!appliedPromo) {
        if (checkoutTotalEl) checkoutTotalEl.innerText = subtotal.toFixed(2);
        if (subtotalEl) subtotalEl.innerText = subtotal.toFixed(2);
        if (breakdownEl) breakdownEl.style.display = 'none';
        if (savingsPillEl) savingsPillEl.style.display = 'none';
    } else {
        let discount = 0;
        if (appliedPromo.discountType === 'percentage') {
            discount = (subtotal * appliedPromo.discountValue) / 100;
            if (appliedPromo.maxDiscount) {
                discount = Math.min(discount, appliedPromo.maxDiscount);
            }
        } else {
            discount = Math.min(appliedPromo.discountValue, subtotal);
        }

        discount = Math.round(discount * 100) / 100;
        finalTotal = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

        if (breakdownEl) breakdownEl.style.display = 'flex';
        if (subtotalEl) subtotalEl.innerText = subtotal.toFixed(2);
        if (discountEl) discountEl.innerText = discount.toFixed(2);
        if (promoLabelEl) {
            promoLabelEl.innerText = appliedPromo.discountType === 'percentage'
                ? `Discount (${appliedPromo.discountValue}% off):`
                : 'Discount:';
        }
        if (promoCodeNameEl) promoCodeNameEl.innerText = appliedPromo.code;
        if (checkoutTotalEl) checkoutTotalEl.innerText = finalTotal.toFixed(2);
        if (savingsPillEl) {
            if (savingsTextEl) {
                savingsTextEl.innerText = `You saved $${discount.toFixed(2)} with code ${appliedPromo.code}!`;
            } else {
                savingsPillEl.innerText = `🎉 Saved -$${discount.toFixed(2)}`;
            }
            savingsPillEl.style.display = 'flex';
        }
    }

    // Auto-generate KHQR payment using the last price (subtotal or discounted final total)
    autoGenerateCheckoutQR(finalTotal);
}

// ==========================================================================
// 1. Auto-Generate Dynamic KHQR via Backend (/api/qr)
// ==========================================================================
async function autoGenerateCheckoutQR(forcedAmount = null) {
    const totalToPay = forcedAmount !== null ? Number(forcedAmount) : getCheckoutFinalTotal();

    // Immediately reflect the target amount in the QR pill
    const qrPayAmountEl = document.getElementById('qr-pay-amount');
    if (qrPayAmountEl) {
        qrPayAmountEl.innerText = `$${totalToPay.toFixed(2)} USD`;
    }

    if (totalToPay <= 0) {
        currentPaymentData = null;
        renderCurrentBankQR();
        return;
    }

    // Prevent duplicate concurrent requests with abort controller
    if (qrFetchAbortController) {
        qrFetchAbortController.abort();
    }
    qrFetchAbortController = new AbortController();

    const spinner = document.getElementById('qr-loading-spinner');
    if (spinner) spinner.style.display = 'flex';

    const apiBase = getApiBase();
    try {
        const response = await fetch(`${apiBase}/api/qr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: totalToPay,
                currency: 'USD',
                bill_number: `ORD-${Date.now().toString().slice(-6)}`
            }),
            signal: qrFetchAbortController.signal
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to auto-generate KHQR');
        }

        const data = await response.json();
        currentPaymentData = data;
        renderCurrentBankQR();
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Could not auto-generate dynamic KHQR:', err.message);
        // Fall back gracefully to static image if backend is temporarily unreachable
        renderCurrentBankQR();
    } finally {
        if (spinner) spinner.style.display = 'none';
    }
}

// ==========================================================================
// 2. Render Active Bank KHQR (ABA vs ACLEDA)
// ==========================================================================
function renderCurrentBankQR() {
    const isAcleda = (selectedBankKey === 'ac' || selectedBankKey === 'acleda');

    const qrImage = document.getElementById('qr-image');
    const paymentLink = document.getElementById('payment-link');
    const qrBeneficiary = document.getElementById('qr-beneficiary');
    const qrAccount = document.getElementById('qr-account');
    const qrBankTag = document.getElementById('qr-bank-tag');
    const qrInstruction = document.getElementById('qr-instruction');
    const qrPayAmount = document.getElementById('qr-pay-amount');

    const totalToPay = getCheckoutFinalTotal();
    if (qrPayAmount) {
        qrPayAmount.innerText = `$${totalToPay.toFixed(2)} USD`;
    }

    if (!isAcleda) {
        // ---- ABA Bank ----
        if (qrBankTag) qrBankTag.innerText = '🇰🇭 ABA Bank KHQR';
        if (qrBeneficiary) qrBeneficiary.innerText = 'JINGPO PHAI';
        if (qrAccount) qrAccount.innerText = 'Acc: 010 777 268 (USD)';
        if (paymentLink) {
            paymentLink.href = 'https://pay.ababank.com/oRF8/4y0ur1w1';
            paymentLink.innerHTML = '<span>🔗 Open ABA App</span>';
            paymentLink.classList.remove('acleda-theme');
        }
        if (qrInstruction) {
            qrInstruction.innerText = 'Scan with ABA Mobile, Bakong, or any Cambodian mobile banking app to pay exact amount';
        }

        if (currentPaymentData && currentPaymentData.aba && currentPaymentData.aba.image) {
            if (qrImage) qrImage.src = currentPaymentData.aba.image;
            if (qrBeneficiary && currentPaymentData.aba.beneficiary) {
                qrBeneficiary.innerText = currentPaymentData.aba.beneficiary;
            }
            if (qrAccount && currentPaymentData.aba.account) {
                qrAccount.innerText = `Acc: ${currentPaymentData.aba.account}`;
            }
            if (qrPayAmount && currentPaymentData.formatted_amount) {
                qrPayAmount.innerText = currentPaymentData.formatted_amount;
            }
        } else {
            if (qrImage) qrImage.src = 'img/Bank/abaqr.jpg';
        }
    } else {
        // ---- ACLEDA Bank ----
        if (qrBankTag) qrBankTag.innerText = '🇰🇭 ACLEDA Bank KHQR';
        if (qrBeneficiary) qrBeneficiary.innerText = 'PHAI JINGPO';
        if (qrAccount) qrAccount.innerText = 'Acc: 011 185 517 829 743';
        if (paymentLink) {
            paymentLink.href = 'https://acledabank.com.kh/acleda?payment_data=qWY5B2SAUfIhLblxzOtfu5ckLzMHjaSki6Ru0bsOyNK+ylPBgZ0sHH6BeGUscKoE58OqGYCB+0+/7oWYyz8zgsTJ6N1UFR6fIgKzYTC4dNA+H3HDmFtNdaTGeaC33xpV6rCwitYe2fTeUBvJ4vj/Hmgxn5Q0fK8JnIUsIRRUfbbAXOWG8G8Zmx250X7rpRvY8O74OMfCDKeJu3nBu08j7lLxGxvnvBJZhfDdJt3urffF2r6v8pr4q3eq0AaRb4Yo&key=khqr';
            paymentLink.innerHTML = '<span>🔗 Open ACLEDA App</span>';
            paymentLink.classList.add('acleda-theme');
        }
        if (qrInstruction) {
            qrInstruction.innerText = 'Scan with ACLEDA Mobile, Bakong, or any Cambodian mobile banking app to pay exact amount';
        }

        if (currentPaymentData && currentPaymentData.acleda && currentPaymentData.acleda.image) {
            if (qrImage) qrImage.src = currentPaymentData.acleda.image;
            if (qrBeneficiary && currentPaymentData.acleda.beneficiary) {
                qrBeneficiary.innerText = currentPaymentData.acleda.beneficiary;
            }
            if (qrAccount && currentPaymentData.acleda.account) {
                qrAccount.innerText = `Acc: ${currentPaymentData.acleda.account}`;
            }
            if (qrPayAmount && currentPaymentData.formatted_amount) {
                qrPayAmount.innerText = currentPaymentData.formatted_amount;
            }
        } else {
            if (qrImage) qrImage.src = 'img/Bank/acqr.jpg';
        }
    }
}

// ==========================================================================
// 3. Bank Switcher: ABA & ACLEDA
// ==========================================================================
function selectBankMethod(method, img, name) {
    selectedBankKey = (method === 'ac' || method === 'acleda') ? 'ac' : 'aba';

    // Toggle active tab buttons
    const btnAba = document.getElementById('bank-tab-aba');
    const btnAc = document.getElementById('bank-tab-ac');
    if (btnAba) btnAba.classList.toggle('active', selectedBankKey === 'aba');
    if (btnAc) btnAc.classList.toggle('active', selectedBankKey === 'ac');

    renderCurrentBankQR();
}

// Backward-compatibility wrapper for legacy bank dropdown
function toggleBankMenu() { }
function chooseBank(method, img, name) {
    selectBankMethod(method, img, name);
}

// Helper: Download the currently displayed QR code
function downloadCurrentQR() {
    const qrImage = document.getElementById('qr-image');
    if (!qrImage || !qrImage.src) {
        alert('QR code image is not available yet.');
        return;
    }

    const bankName = selectedBankKey === 'ac' ? 'ACLEDA' : 'ABA';
    const amountVal = getCheckoutFinalTotal().toFixed(2);
    const link = document.createElement('a');
    link.download = `KHQR-${bankName}-$${amountVal}.png`;
    link.href = qrImage.src;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================================================
// 4. Proceed to Payment Page (Step 1 -> Step 2)
// ==========================================================================
function proceedToPayment(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (typeof cart === 'undefined' || !cart || cart.length === 0) {
        try {
            const stored = JSON.parse(localStorage.getItem('cart') || '[]');
            if (stored && stored.length > 0) {
                cart = stored;
            }
        } catch (e) {}
    }

    if (typeof cart === 'undefined' || !cart || cart.length === 0) {
        alert("Your cart is empty! Please add products before checking out.");
        return;
    }

    const name = document.getElementById('cus-name')?.value.trim();
    const phone = document.getElementById('cus-phone')?.value.trim();
    const address = document.getElementById('cus-address')?.value.trim();
    const note = document.getElementById('cus-note')?.value.trim() || 'None';

    if (!name) {
        alert("Please enter your full name.");
        document.getElementById('cus-name')?.focus();
        return;
    }
    if (!phone) {
        alert("Please enter your phone number.");
        document.getElementById('cus-phone')?.focus();
        return;
    }
    if (!address) {
        alert("Please enter your delivery address.");
        document.getElementById('cus-address')?.focus();
        return;
    }

    const subtotalVal = (typeof getCartSubtotal === 'function') 
        ? getCartSubtotal().toFixed(2) 
        : (cart.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.quantity, 10) || 1), 0)).toFixed(2);
    const totalVal = (typeof getCheckoutFinalTotal === 'function') 
        ? getCheckoutFinalTotal().toFixed(2) 
        : (document.getElementById('checkout-total-price')?.innerText || subtotalVal);
    const discountVal = (typeof appliedPromo !== 'undefined' && appliedPromo) 
        ? (document.getElementById('checkout-discount-amount')?.innerText || '0.00') 
        : '0.00';

    const pendingData = {
        userid: localStorage.getItem('jj_userId') || 'GUEST',
        name: name,
        phone: phone,
        address: address,
        note: note,
        subtotal: subtotalVal,
        promo_code: (typeof appliedPromo !== 'undefined' && appliedPromo) ? appliedPromo.code : null,
        discount_amount: discountVal,
        total: totalVal,
        items: cart
    };

    sessionStorage.setItem('jj_pending_checkout', JSON.stringify(pendingData));
    localStorage.setItem('jj_pending_checkout', JSON.stringify(pendingData));

    // Clear stale html cache so checkout modal stays up to date
    try {
        localStorage.removeItem('jj_html_checkout/checkout.html');
        localStorage.removeItem('jj_html_v2_checkout/checkout.html');
        localStorage.removeItem('jj_html_v3_checkout/checkout.html');
    } catch(e) {}

    // Navigate to the dedicated payment page
    const targetPaymentUrl = window.location.pathname.includes('/checkout/') ? '../payment.html' : 'payment.html';
    window.location.href = targetPaymentUrl;
}

// ==========================================================================
// 5. Modal Open & Close Flow
// ==========================================================================
function openCheckout() {
    if (typeof cart === 'undefined' || !cart || cart.length === 0) {
        alert("Your cart is empty! Please add products before checking out.");
        return;
    }

    const checkoutModal = document.getElementById('checkout-modal');
    if (!checkoutModal) {
        window.location.href = 'checkout.html';
        return;
    }

    // Smoothly close the cart drawer and its overlay
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');
    if (cartSidebar) cartSidebar.classList.remove('open');
    if (cartOverlay) cartOverlay.classList.remove('active');

    // Update total price in checkout modal
    updateCheckoutPricingUI();

    // Auto pre-fill customer name if logged in
    const savedName = localStorage.getItem('jj_username');
    const nameInput = document.getElementById('cus-name');
    if (nameInput && savedName && !nameInput.value) {
        nameInput.value = savedName;
    }

    // Open checkout modal smoothly on the SAME page
    checkoutModal.style.display = 'flex';
    checkoutModal.offsetHeight; // Force reflow
    checkoutModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCheckout() {
    const checkoutModal = document.getElementById('checkout-modal');
    if (checkoutModal) {
        checkoutModal.classList.remove('active');
        setTimeout(() => {
            checkoutModal.style.display = 'none';
            document.body.style.overflow = '';
        }, 250);
    } else {
        document.body.style.overflow = '';
    }
}

// ==========================================================================
// 5. Receipt Image Preview & Remove
// ==========================================================================
function previewReceipt(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
        const preview = document.getElementById('receipt-preview');
        const previewWrap = document.getElementById('receipt-preview-wrapper');
        const placeholder = document.getElementById('receipt-upload-placeholder');

        if (preview) preview.src = reader.result;
        if (previewWrap) previewWrap.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';

        receiptBase64 = reader.result;
        receiptMimeType = file.type;
    };
    reader.readAsDataURL(file);
}

function removeReceipt(e) {
    if (e) e.stopPropagation();
    const input = document.getElementById('receipt-upload');
    const previewWrap = document.getElementById('receipt-preview-wrapper');
    const placeholder = document.getElementById('receipt-upload-placeholder');

    if (input) input.value = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    receiptBase64 = '';
    receiptMimeType = '';
}

// ==========================================================================
// 6. GPS Real Location Detection
// ==========================================================================
function getRealLocation() {
    const addressInput = document.getElementById('cus-address');
    const locationBtn = document.getElementById('btn-location');

    if (navigator.geolocation) {
        if (locationBtn) {
            locationBtn.innerHTML = "⏳ Detecting...";
            locationBtn.disabled = true;
        }

        navigator.geolocation.getCurrentPosition(
            function (position) {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
                if (addressInput) {
                    addressInput.value = addressInput.value ? `${addressInput.value}\n📍 GPS: ${mapsUrl}` : `📍 GPS: ${mapsUrl}`;
                }
                if (locationBtn) {
                    locationBtn.innerHTML = "✅ Found";
                    locationBtn.disabled = false;
                }
            },
            function (error) {
                alert("Location access denied or unavailable. Please type your address manually.");
                if (locationBtn) {
                    locationBtn.innerHTML = "📍 Auto GPS";
                    locationBtn.disabled = false;
                }
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        alert("Your browser does not support Geolocation.");
    }
}

// ==========================================================================
// 7. Promo Code Management (Validate & Apply)
// ==========================================================================
async function applyPromoCode() {
    const input = document.getElementById('promo-code-input');
    const feedback = document.getElementById('promo-feedback-msg');
    const applyBtn = document.getElementById('btn-apply-promo');
    const inputContainer = document.getElementById('promo-input-container');
    const badgeContainer = document.getElementById('promo-applied-badge');
    const badgeCode = document.getElementById('applied-promo-code-display');
    const badgeDesc = document.getElementById('applied-promo-desc-display');

    if (!input || !input.value.trim()) {
        if (feedback) {
            feedback.className = 'promo-feedback-msg error';
            feedback.innerText = 'Please enter a coupon code.';
            feedback.style.display = 'block';
        }
        return;
    }

    const code = input.value.trim().toUpperCase();
    const subtotal = getCartSubtotal();

    if (subtotal <= 0) {
        if (feedback) {
            feedback.className = 'promo-feedback-msg error';
            feedback.innerText = 'Your cart is empty.';
            feedback.style.display = 'block';
        }
        return;
    }

    const apiBase = getApiBase();

    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.innerText = 'Checking...';
    }

    try {
        const response = await fetch(apiBase + '/promotion/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code, subtotal: subtotal })
        });

        const data = await response.json();

        if (response.ok && data.valid) {
            appliedPromo = data;
            // updateCheckoutPricingUI automatically triggers dynamic QR update with discounted price
            updateCheckoutPricingUI();

            if (inputContainer) inputContainer.style.display = 'none';
            if (badgeContainer) badgeContainer.style.display = 'flex';
            if (badgeCode) badgeCode.innerText = data.code;
            if (badgeDesc) badgeDesc.innerText = data.description || (data.discountType === 'percentage' ? `${data.discountValue}% discount applied` : `$${data.discountAmount.toFixed(2)} off applied`);

            if (feedback) {
                feedback.className = 'promo-feedback-msg success';
                feedback.innerText = data.message || 'Promo code applied successfully!';
                feedback.style.display = 'block';
            }
        } else {
            if (feedback) {
                feedback.className = 'promo-feedback-msg error';
                feedback.innerText = data.message || 'Invalid promotion code.';
                feedback.style.display = 'block';
            }
        }
    } catch (err) {
        console.error('Promo validation error:', err);
        if (feedback) {
            feedback.className = 'promo-feedback-msg error';
            feedback.innerText = 'Could not validate promo code. Check connection.';
            feedback.style.display = 'block';
        }
    } finally {
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.innerText = 'Apply';
        }
    }
}

function removePromoCode() {
    appliedPromo = null;
    // updateCheckoutPricingUI automatically re-generates QR with original subtotal
    updateCheckoutPricingUI();

    const input = document.getElementById('promo-code-input');
    const feedback = document.getElementById('promo-feedback-msg');
    const inputContainer = document.getElementById('promo-input-container');
    const badgeContainer = document.getElementById('promo-applied-badge');

    if (input) input.value = '';
    if (inputContainer) inputContainer.style.display = 'flex';
    if (badgeContainer) badgeContainer.style.display = 'none';
    if (feedback) {
        feedback.style.display = 'none';
        feedback.innerText = '';
    }
}

// ==========================================================================
// 8. Submit Order Forwarder -> Direct to Dedicated Payment Page
// ==========================================================================
async function submitOrder(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    return proceedToPayment(event);
}

// ==========================================================================
// 9. In-Page Order Success Modal
// ==========================================================================
function showOrderSuccessModal(orderId) {
    const successModal = document.getElementById('order-success-modal');
    const orderIdEl = document.getElementById('success-order-id');
    if (orderIdEl) orderIdEl.innerText = orderId;

    if (successModal) {
        successModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeOrderSuccessModal() {
    const successModal = document.getElementById('order-success-modal');
    if (successModal) {
        successModal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// Global form submission interceptor for checkout-form
document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'checkout-form') {
        e.preventDefault();
        e.stopPropagation();
        proceedToPayment(e);
    }
}, true);

// Clear stale modal cache on script load so any outdated checkout modals get updated
try {
    localStorage.removeItem('jj_html_checkout/checkout.html');
    localStorage.removeItem('jj_html_v2_checkout/checkout.html');
    localStorage.removeItem('jj_html_v3_checkout/checkout.html');
} catch (e) { }

// Auto-run if standalone page or already loaded in DOM
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (document.getElementById('checkout-total-price')) {
            updateCheckoutPricingUI();
        }
    }, 100);
} else {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('checkout-total-price')) {
            updateCheckoutPricingUI();
        }
    });
}