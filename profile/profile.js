// ============================================================
// 📌 profile.js — Profile Page Logic
// ============================================================

// ✅ NodeJS Backend API (replaces Google Apps Script)
const API_BASE_PROFILE  = CONFIG.API_BASE;
const ORDER_API_BASE    = API_BASE_PROFILE + '/order'; // /order, /order/user/:id
const AUTH_API_BASE     = API_BASE_PROFILE + '/user';  // /user/login, /user/change-password
const OTP_API_BASE      = API_BASE_PROFILE + '/otp';   // /otp/generate, /otp/verify

// ========================
// Auto-Refresh Timer
// ========================
let orderAutoRefreshInterval = null;
const AUTO_REFRESH_MS = 60 * 60 * 1000; // 1 hour

function startOrderAutoRefresh() {
    stopOrderAutoRefresh(); // Clear any existing timer first
    orderAutoRefreshInterval = setInterval(() => {
        const modal = document.getElementById('profile-modal');
        // Only auto-refresh if the profile is currently open
        if (modal && modal.classList.contains('open')) {
            console.log('[Profile] Auto-refreshing orders (1 hour interval)...');
            loadProfileOrders(true);
        }
    }, AUTO_REFRESH_MS);
}

function stopOrderAutoRefresh() {
    if (orderAutoRefreshInterval) {
        clearInterval(orderAutoRefreshInterval);
        orderAutoRefreshInterval = null;
    }
}

// ========================
// Open / Close Profile
// ========================
function openProfile() {
    const modal = document.getElementById('profile-modal');
    if (!modal) {
        window.location.href = 'index.html?openProfile=true';
        return;
    }

    modal.classList.add('open');

    // Clear search box to prevent browser autofill from hiding orders
    const searchBox = document.getElementById('profile-order-search');
    if (searchBox) searchBox.value = '';

    loadProfileData();
    loadProfileOrders();
    startOrderAutoRefresh(); // Start the 1-hour auto-refresh
}

function closeProfile() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.remove('open');

    stopOrderAutoRefresh(); // Stop auto-refresh when profile is closed

    // Clear password form
    const form = document.getElementById('change-password-form');
    if (form) form.reset();
    const errEl = document.getElementById('password-error');
    const sucEl = document.getElementById('password-success');
    if (errEl) errEl.textContent = '';
    if (sucEl) sucEl.textContent = '';
}

// ========================
// Double-Click Refresh on "My Orders" Tab
// ========================
function handleOrdersTabDblClick() {
    const tabBtn = document.getElementById('ptab-orders');
    if (!tabBtn) return;

    // Show a loading spinner on the tab text
    const originalText = tabBtn.textContent;
    tabBtn.textContent = '🔄 Refreshing...';
    tabBtn.style.pointerEvents = 'none'; // Prevent spam clicks
    tabBtn.style.opacity = '0.6';

    loadProfileOrders(true).then(() => {
        tabBtn.textContent = '✅ Updated!';
        setTimeout(() => {
            tabBtn.textContent = originalText;
            tabBtn.style.pointerEvents = '';
            tabBtn.style.opacity = '';
        }, 1200);
    }).catch(() => {
        tabBtn.textContent = '❌ Failed';
        setTimeout(() => {
            tabBtn.textContent = originalText;
            tabBtn.style.pointerEvents = '';
            tabBtn.style.opacity = '';
        }, 1500);
    });
}

// ========================
// Load User Profile Data
// ========================
function formatProfileDate(raw) {
    if (!raw || raw === '—') return '—';
    if (raw.includes('/') && (raw.includes('am') || raw.includes('pm') || raw.includes('AM') || raw.includes('PM'))) {
        return raw;
    }
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Phnom_Penh'
    });
}

function loadProfileData() {
    const username = localStorage.getItem('jj_username') || '—';
    const userId = localStorage.getItem('jj_userId') || '—';
    let regDate = localStorage.getItem('jj_regDate') || '—';
    if (regDate !== '—') regDate = formatProfileDate(regDate);

    const avatar = localStorage.getItem('jj_avatar');

    // Profile header
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) {
        if (avatar) {
            avatarEl.innerHTML = `<img src="${avatar}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            avatarEl.textContent = username.substring(0, 2).toUpperCase();
        }
    }

    const nameEl = document.getElementById('profile-name');
    if (nameEl) nameEl.textContent = username;

    const idEl = document.getElementById('profile-id');
    if (idEl) idEl.textContent = userId;

    const joinedEl = document.getElementById('profile-joined');
    if (joinedEl) joinedEl.textContent = regDate !== '—' ? 'Member since: ' + regDate : '';

    // Settings tab
    const setUser = document.getElementById('settings-username');
    if (setUser) setUser.textContent = username;

    const setId = document.getElementById('settings-userid');
    if (setId) setId.textContent = userId;

    const setDate = document.getElementById('settings-regdate');
    if (setDate) setDate.textContent = regDate;

    // If registration date is missing from storage, fetch immediately from backend (MySQL)
    if ((!regDate || regDate === '—') && userId && userId !== '—') {
        const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '';
        fetch(apiBase + '/user/get-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
        })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success' && data.registerDate) {
                const formatted = formatProfileDate(data.registerDate);
                localStorage.setItem('jj_regDate', formatted);
                if (setDate) setDate.textContent = formatted;
                if (joinedEl) joinedEl.textContent = 'Member since: ' + formatted;
            }
        })
        .catch(err => console.warn('Could not load user register date:', err));
    }
}

// ========================
// Load User Orders
// ========================
let cachedOrdersJson = null;
let cachedUserId = null;
let lastOrdersFetchTime = 0;
let isLoadingOrders = false;

async function loadProfileOrders(forceRefresh = false) {
    const userId = localStorage.getItem('jj_userId');
    const listEl = document.getElementById('profile-order-list');

    if (!userId || !listEl) return;

    // Prevent duplicate simultaneous fetches
    if (isLoadingOrders) return;

    if (forceRefresh) {
        cachedOrdersJson = null;
        lastOrdersFetchTime = 0;
    }

    if (cachedUserId !== userId) {
        cachedOrdersJson = null;
        cachedUserId = userId;
        lastOrdersFetchTime = 0;
    }

    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    // If cache exists and less than 1 hour old, skip fetch
    if (cachedOrdersJson && (now - lastOrdersFetchTime < ONE_HOUR) && !forceRefresh) {
        return;
    }

    // Show loading only on first load (no cached data yet)
    if (!cachedOrdersJson) {
        listEl.innerHTML = '<p style="text-align:center; color:#999; padding: 30px 0;">⏳ Loading orders...</p>';
    }

    isLoadingOrders = true;

    try {
        const response = await fetch(ORDER_API_BASE + '/user/' + encodeURIComponent(userId));
        const orders = await response.json();
        const newOrdersJson = JSON.stringify(orders);

        lastOrdersFetchTime = Date.now();

        // Smart diff: if data hasn't changed, skip re-render entirely
        if (cachedOrdersJson === newOrdersJson) {
            isLoadingOrders = false;
            return;
        }
        cachedOrdersJson = newOrdersJson;

        // Update summary cards
        const totalEl = document.getElementById('total-orders');
        const pendingEl = document.getElementById('pending-orders');
        const successEl = document.getElementById('success-orders');

        if (totalEl) totalEl.textContent = orders.length;

        const pendingCount = orders.filter(o => {
            const s = (o.status || '').toLowerCase();
            return s === 'pending' || s === 'confirm order' || s === 'ordered' || s === 'in china';
        }).length;
        const successCount = orders.filter(o => {
            const s = (o.status || '').toLowerCase();
            return s === 'arrived khmer' || s === 'will be send to you' || s === 'success' || s === 'completed';
        }).length;

        if (pendingEl) pendingEl.textContent = pendingCount;
        if (successEl) successEl.textContent = successCount;

        // Render order list
        if (orders.length === 0) {
            listEl.innerHTML = `
                <div class="no-orders-msg">
                    <span class="no-orders-icon">📦</span>
                    <p>No orders yet.</p>
                    <p style="font-size:12px;">Start shopping to see your orders here!</p>
                </div>`;
            isLoadingOrders = false;
            return;
        }

        let html = '';
        // Show newest first
        orders.reverse().forEach(order => {
            let itemsHtml = '';
            try {
                const itemsArr = JSON.parse(order.items);
                itemsArr.forEach(item => {
                    itemsHtml += `<li>${item.name} (x${item.quantity})</li>`;
                });
            } catch (e) {
                itemsHtml = `<li>${order.items}</li>`;
            }

            const statusVal = order.status || 'Pending';
            let pillColor = '#ffffff'; let pillBg = '#f59e0b'; // amber (Pending)
            let border = 'none'; let shadow = '0 2px 4px rgba(0,0,0,0.1)';
            if (statusVal === 'Confirm order') { pillBg = '#3b82f6'; } // blue
            if (statusVal === 'Ordered') { pillBg = '#8b5cf6'; } // purple
            if (statusVal === 'In China') { pillBg = '#ec4899'; } // pink
            if (statusVal === 'Arrived Khmer') { pillBg = '#0ea5e9'; } // sky blue
            if (statusVal === 'Will be send to you' || statusVal === 'Completed') { pillBg = '#10b981'; } // emerald (Completed)
            if (statusVal === 'Cancelled') { pillBg = '#ef4444'; } // red

            let historyJson = order.history || '[]';
            let encodedHistory = encodeURIComponent(historyJson);

            html += `
                <div class="order-card" style="margin-bottom: 20px; background: #fff; padding: 15px; border-radius: 12px; border: 1px solid #f1f1f1;">
                    <div class="order-card-header">
                        <span class="order-id-label">🆔 ${order.orderId || 'N/A'}</span>
                        <button class="order-status-pill" style="color: ${pillColor}; background: ${pillBg}; border: ${border}; box-shadow: ${shadow};" onclick="openTimeline('${encodedHistory}', '${statusVal}')">
                            ${statusVal}
                        </button>
                    </div>
                    <div class="order-detail-row">
                        <span class="order-detail-label">Date</span>
                        <span class="order-detail-value">${order.date || '—'}</span>
                    </div>
                    <div class="order-detail-row">
                        <span class="order-detail-label">Total</span>
                        <span class="order-detail-value" style="color:#e74c3c;">$${order.total || '0'}</span>
                    </div>
                    <div class="order-detail-row">
                        <span class="order-detail-label">Note</span>
                        <span class="order-detail-value">${order.note || 'គ្មាន'}</span>
                    </div>
                    <div class="order-items-list">
                        <ul>
                            ${itemsHtml}
                        </ul>
                    </div>
                </div>`;
        });

        listEl.innerHTML = html;

        // Re-apply current filter and search
        filterProfileOrders();

    } catch (error) {
        // Only show error if we have no cached data to display
        if (!cachedOrdersJson) {
            listEl.innerHTML = '<p style="text-align:center; color:#e74c3c; padding: 30px 0;">❌ Failed to load orders.</p>';
        }
    } finally {
        isLoadingOrders = false;
    }
}

// ========================
// Tab Switching
// ========================
function showProfileTab(tab) {
    const ordersTab = document.getElementById('ptab-orders');
    const settingsTab = document.getElementById('ptab-settings');
    const ordersContent = document.getElementById('profile-orders');
    const settingsContent = document.getElementById('profile-settings');

    if (tab === 'orders') {
        ordersTab.classList.add('active');
        settingsTab.classList.remove('active');
        ordersContent.classList.add('active');
        settingsContent.classList.remove('active');
    } else {
        ordersTab.classList.remove('active');
        settingsTab.classList.add('active');
        ordersContent.classList.remove('active');
        settingsContent.classList.add('active');
    }
}

// ========================
// Change Password via Email OTP (Same as Login Forgot Password Flow)
// ========================
let pendingPasswordChange = null;

async function handleChangePassword(event) {
    event.preventDefault();

    const newPw = document.getElementById('new-password').value;
    const confirmPw = document.getElementById('confirm-new-password').value;
    const errEl = document.getElementById('password-error');
    const sucEl = document.getElementById('password-success');
    const btn = document.getElementById('change-pw-btn');

    errEl.textContent = '';
    sucEl.textContent = '';

    // Validation
    if (!newPw || !confirmPw) {
        errEl.textContent = '❌ Please enter and confirm your new password.';
        return;
    }
    if (newPw !== confirmPw) {
        errEl.textContent = '❌ Passwords do not match!';
        return;
    }
    if (newPw.length < 4) {
        errEl.textContent = '❌ New password must be at least 4 characters.';
        return;
    }

    const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '';
    const userId = localStorage.getItem('jj_userId');
    let email = localStorage.getItem('jj_email');

    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-loader').style.display = 'inline';
    btn.disabled = true;

    try {
        // If email is not in localStorage, fetch from database
        if (!email && userId) {
            const userCheck = await fetch(apiBase + '/user/get-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId })
            });
            const userData = await userCheck.json();
            if (userData.status === 'success' && userData.email) {
                email = userData.email;
                localStorage.setItem('jj_email', email);
            }
        }

        if (!email) {
            errEl.textContent = '❌ Registered email not found. Please log in again.';
            return;
        }

        // Store pending request in memory
        pendingPasswordChange = {
            newPw: newPw,
            email: email,
            userId: userId
        };

        // 1. Generate 6-digit OTP code from backend
        const otpResponse = await fetch(apiBase + '/otp/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        const otpData = await otpResponse.json();

        if (otpData.status === 'SUCCESS') {
            // 2. Send OTP via EmailJS (template_abzvhmj)
            await emailjs.send("service_uug1k5r", "template_abzvhmj", {
                to_email: email,
                otp_code: otpData.otp
            });

            // 3. Open OTP Verification Modal
            document.getElementById('profile-otp-email').textContent = email;
            document.getElementById('profile-otp-input').value = '';
            document.getElementById('profile-otp-error').textContent = '';
            document.getElementById('profile-otp-modal').style.display = 'flex';
        } else {
            errEl.textContent = '❌ Failed to generate OTP: ' + (otpData.message || 'Please try again.');
        }
    } catch (error) {
        console.error('Change password error:', error);
        errEl.textContent = '❌ Error connecting to server. Please try again.';
    } finally {
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.btn-loader').style.display = 'none';
        btn.disabled = false;
    }
}

// ========================
// OTP Modal Functions for Change Password
// ========================
function closeProfileOTPModal() {
    document.getElementById('profile-otp-modal').style.display = 'none';
    document.getElementById('profile-otp-input').value = '';
    document.getElementById('profile-otp-error').textContent = '';
    pendingPasswordChange = null;
}

async function handleProfileVerifyOTP() {
    const otpInput = document.getElementById('profile-otp-input').value.trim();
    const errorEl = document.getElementById('profile-otp-error');
    const btn = document.getElementById('profile-otp-verify-btn');
    const formErrEl = document.getElementById('password-error');
    const formSucEl = document.getElementById('password-success');

    errorEl.textContent = '';

    if (!otpInput || otpInput.length !== 6) {
        errorEl.textContent = 'Please enter the 6-digit verification code.';
        return;
    }

    if (!pendingPasswordChange) {
        errorEl.textContent = 'Session expired. Please try requesting a new OTP.';
        return;
    }

    const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '';

    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-loader').style.display = 'inline';
    btn.disabled = true;

    try {
        // 1. Verify OTP code
        const response = await fetch(apiBase + '/otp/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: pendingPasswordChange.email,
                otp: otpInput
            })
        });

        const data = await response.json();

        if (data.status === 'SUCCESS') {
            // 2. OTP is verified! Now update password in database
            const pwResponse = await fetch(apiBase + '/user/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: pendingPasswordChange.email,
                    newPassword: pendingPasswordChange.newPw,
                    userId: pendingPasswordChange.userId
                })
            });

            const pwResult = await pwResponse.json();

            closeProfileOTPModal();

            if (pwResult.status === 'success') {
                formSucEl.textContent = '✅ ' + (pwResult.message || 'Password updated successfully!');
                document.getElementById('change-password-form').reset();
            } else {
                formErrEl.textContent = '❌ ' + (pwResult.message || 'Failed to update password.');
            }
        } else {
            errorEl.textContent = data.message || 'Invalid or expired code. Please try again.';
        }
    } catch (error) {
        console.error('Verify OTP error:', error);
        errorEl.textContent = 'Verification error. Please try again.';
    } finally {
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.btn-loader').style.display = 'none';
        btn.disabled = false;
    }
}

async function handleProfileResendOTP() {
    const errorEl = document.getElementById('profile-otp-error');
    const resendBtn = document.getElementById('profile-otp-resend-btn');

    if (!pendingPasswordChange) {
        errorEl.textContent = 'Session expired. Please close and try again.';
        return;
    }

    const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '';

    resendBtn.textContent = 'Sending...';
    resendBtn.disabled = true;
    errorEl.textContent = '';

    try {
        const otpResponse = await fetch(apiBase + '/otp/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingPasswordChange.email })
        });

        const otpData = await otpResponse.json();

        if (otpData.status === 'SUCCESS') {
            await emailjs.send("service_uug1k5r", "template_abzvhmj", {
                to_email: pendingPasswordChange.email,
                otp_code: otpData.otp
            });

            errorEl.textContent = '✅ New verification code sent to your email!';
            errorEl.style.color = '#2ecc71';
            setTimeout(() => {
                errorEl.textContent = '';
                errorEl.style.color = '#e74c3c';
            }, 3500);
        } else {
            errorEl.textContent = 'Failed to resend OTP code.';
        }
    } catch (error) {
        console.error('Resend OTP error:', error);
        errorEl.textContent = 'Connection error. Please try again.';
    } finally {
        resendBtn.textContent = "Didn't receive it? Resend OTP";
        resendBtn.disabled = false;
    }
}

// ========================
// Timeline Modal
// ========================
function openTimeline(encodedHistory, currentStatus) {
    const historyJson = decodeURIComponent(encodedHistory);
    let history = [];
    try {
        history = JSON.parse(historyJson);
    } catch (e) {
        history = [];
    }

    const allStatuses = [
        "Pending",
        "Confirm order",
        "Ordered",
        "In China",
        "Arrived Khmer",
        "Will be send to you"
    ];

    let stepperHtml = '';
    let hasReachedCurrent = false;

    allStatuses.forEach((status, index) => {
        let historyEntry = history.find(h => h.status === status);
        let isCurrent = (status === currentStatus);

        let stepClass = '';
        if (isCurrent) {
            stepClass = 'current';
            hasReachedCurrent = true;
        } else if (!hasReachedCurrent) {
            stepClass = 'completed';
        } else {
            stepClass = '';
        }

        let timeStr = historyEntry ? historyEntry.date : 'Not yet reached';

        if (stepClass === 'completed' && !historyEntry) {
            timeStr = 'Skipped / Unknown time';
        } else if (stepClass === 'current' && !historyEntry) {
            timeStr = 'Unknown time';
        }

        stepperHtml += `
            <div class="step ${stepClass}">
                <div class="step-icon">${stepClass === 'completed' ? '✓' : (index + 1)}</div>
                <div class="step-content">
                    <div class="step-title">${status}</div>
                    <div class="step-time">${timeStr}</div>
                </div>
            </div>
        `;
    });

    document.getElementById('timeline-stepper').innerHTML = stepperHtml;
    const modal = document.getElementById('timeline-modal');
    modal.style.display = 'flex';
    modal.style.opacity = '0';
    setTimeout(() => { modal.style.transition = 'opacity 0.3s'; modal.style.opacity = '1'; }, 10);
}

function closeTimeline() {
    const modal = document.getElementById('timeline-modal');
    modal.style.opacity = '0';
    setTimeout(() => { modal.style.display = 'none'; }, 300);
}

// Close profile when clicking outside
document.addEventListener('click', function (event) {
    const modal = document.getElementById('profile-modal');
    if (modal && event.target === modal) {
        closeProfile();
    }
});

// ========================
// Filter Orders (Search & Status)
// ========================
let currentOrderFilter = 'all';

function filterByStatus(status) {
    currentOrderFilter = status;

    // Update active UI classes
    document.getElementById('card-all').classList.remove('active-filter');
    document.getElementById('card-pending').classList.remove('active-filter');
    document.getElementById('card-completed').classList.remove('active-filter');

    if (status === 'all') document.getElementById('card-all').classList.add('active-filter');
    if (status === 'pending') document.getElementById('card-pending').classList.add('active-filter');
    if (status === 'completed') document.getElementById('card-completed').classList.add('active-filter');

    filterProfileOrders();
}

function filterProfileOrders() {
    const searchBox = document.getElementById('profile-order-search');
    if (!searchBox) return;

    const query = searchBox.value.toLowerCase().trim();
    const orderCards = document.querySelectorAll('#profile-order-list .order-card');

    orderCards.forEach(card => {
        let matchText = true;
        if (query) {
            const orderIdEl = card.querySelector('.order-id-label');
            if (orderIdEl) {
                const orderIdText = orderIdEl.textContent.toLowerCase();
                if (!orderIdText.includes(query)) {
                    matchText = false;
                }
            }
        }

        let matchStatus = true;
        if (currentOrderFilter !== 'all') {
            const pill = card.querySelector('.order-status-pill');
            if (pill) {
                const s = pill.textContent.trim().toLowerCase();
                const isCompleted = s === 'arrived khmer' || s === 'will be send to you' || s === 'success' || s === 'completed';
                if (currentOrderFilter === 'completed' && !isCompleted) matchStatus = false;
                if (currentOrderFilter === 'pending' && isCompleted) matchStatus = false;
            }
        }

        if (matchText && matchStatus) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}
