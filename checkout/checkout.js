// ==========================================================================
// JingJang Store — In-Page Checkout & Payment Logic (checkout.js)
// Completely In-Page: No Redirects to other pages!
// ==========================================================================

let receiptBase64 = "";
let receiptMimeType = "";
let selectedBankKey = "aba";

// 1. Open In-Page Checkout Modal
function openCheckout() {
    if (!cart || cart.length === 0) {
        alert("Your cart is empty! Please add products before checking out.");
        return;
    }

    // Smoothly close the cart drawer and its overlay
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');
    if (cartSidebar) cartSidebar.classList.remove('open');
    if (cartOverlay) cartOverlay.classList.remove('active');

    // Update total price in checkout modal
    const cartTotalEl = document.getElementById('cart-total');
    const checkoutTotalEl = document.getElementById('checkout-total-price');
    if (checkoutTotalEl && cartTotalEl) {
        checkoutTotalEl.innerText = cartTotalEl.innerText;
    }

    // Auto pre-fill customer name if logged in
    const savedName = localStorage.getItem('jj_username');
    const nameInput = document.getElementById('cus-name');
    if (nameInput && savedName && !nameInput.value) {
        nameInput.value = savedName;
    }

    // Open checkout modal smoothly on the SAME page
    const checkoutModal = document.getElementById('checkout-modal');
    if (checkoutModal) {
        checkoutModal.style.display = 'flex';
        // Force reflow for smooth animation
        checkoutModal.offsetHeight;
        checkoutModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// 2. Close In-Page Checkout Modal
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

// 3. Bank Selection Tabs (ABA / ACLEDA)
function selectBankMethod(method, img, name) {
    selectedBankKey = method;

    // Toggle active tab buttons
    const btnAba = document.getElementById('bank-tab-aba');
    const btnAc = document.getElementById('bank-tab-ac');
    if (btnAba) btnAba.classList.toggle('active', method === 'aba');
    if (btnAc) btnAc.classList.toggle('active', method === 'ac');

    const link = document.getElementById('payment-link');
    const qrImage = document.getElementById('qr-image');

    if (method === 'aba') {
        if (link) {
            link.href = "https://pay.ababank.com/oRF8/4y0ur1w1";
            link.innerHTML = "<span>🔗 Open ABA App / Pay</span>";
        }
        if (qrImage) {
            qrImage.src = "img/Bank/abaqr.jpg";
        }
    } else if (method === 'ac') {
        if (link) {
            link.href = "https://acledabank.com.kh/acleda?payment_data=qWY5B2SAUfIhLblxzOtfu5ckLzMHjaSki6Ru0bsOyNK+ylPBgZ0sHH6BeGUscKoE58OqGYCB+0+/7oWYyz8zgsTJ6N1UFR6fIgKzYTC4dNA+H3HDmFtNdaTGeaC33xpV6rCwitYe2fTeUBvJ4vj/Hmgxn5Q0fK8JnIUsIRRUfbbAXOWG8G8Zmx250X7rpRvY8O74OMfCDKeJu3nBu08j7lLxGxvnvBJZhfDdJt3urffF2r6v8pr4q3eq0AaRb4Yo&key=khqr";
            link.innerHTML = "<span>🔗 Open ACLEDA App / Pay</span>";
        }
        if (qrImage) {
            qrImage.src = "img/Bank/acqr.jpg";
        }
    }
}

// Backward-compatibility wrapper for legacy bank dropdown
function toggleBankMenu() { }
function chooseBank(method, img, name) {
    selectBankMethod(method, img, name);
}

// 4. Receipt Image Preview & Remove
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

// 5. GPS Real Location Detection
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

// 6. Submit Order Flow (Fully In-Page, Never Redirects)
async function submitOrder(event) {
    event.preventDefault();

    if (!cart || cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    if (!receiptBase64) {
        alert("Please upload your payment screenshot to confirm your order.");
        return;
    }

    const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE)
        ? CONFIG.API_BASE
        : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
            ? 'http://localhost:3000'
            : 'https://jingjang-store-backend.onrender.com');

    const API_URL = apiBase + '/order';

    const submitBtn = document.getElementById('checkout-submit-button');
    const btnText = document.getElementById('submit-btn-text');
    const btnSpinner = document.getElementById('submit-btn-spinner');

    if (btnText) btnText.innerText = 'Processing Order...';
    if (btnSpinner) btnSpinner.style.display = 'inline-block';
    if (submitBtn) submitBtn.disabled = true;

    const userId = localStorage.getItem('jj_userId') || 'GUEST';
    const totalVal = document.getElementById('checkout-total-price')?.innerText || '0.00';

    const orderData = {
        userid: userId,
        name: document.getElementById('cus-name')?.value || '',
        Phone: document.getElementById('cus-phone')?.value || '',
        Address: document.getElementById('cus-address')?.value || '',
        Note: document.getElementById('cus-note')?.value || 'None',
        Total: totalVal,
        Items: JSON.stringify(cart),
        Receipt: receiptBase64 || 'No Receipt'
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(orderData),
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        const orderId = result.orderId || ('JJ-' + Math.floor(100000 + Math.random() * 900000));

        // Clear user cart safely
        cart = [];
        saveCartToLocalStorage();
        updateCartUI();

        // Reset form
        document.getElementById('checkout-form')?.reset();
        removeReceipt();

        // Close checkout modal without any redirection
        closeCheckout();

        // Show celebratory in-page success modal
        showOrderSuccessModal(orderId);

        // Force refresh profile orders in background if available
        if (typeof loadProfileOrders === 'function') {
            loadProfileOrders(true);
        }

    } catch (error) {
        console.error('Order submission error:', error);
        alert('Could not submit order. Please check your internet connection and try again.');
    } finally {
        if (btnText) btnText.innerText = 'Confirm Order & Pay';
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
    }
}

// 7. In-Page Order Success Modal
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