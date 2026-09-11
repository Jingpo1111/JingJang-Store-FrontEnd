// ==========================================================================
// JingJang Store — Shopping Cart State & Logic (cart.js)
// ==========================================================================

let cart = [];

// Synchronously load cart from localStorage safely
try {
    const stored = localStorage.getItem('jj_cart');
    if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
            cart = parsed;
        }
    }
} catch (e) {
    console.warn('Could not parse cart from localStorage:', e);
    cart = [];
}

function saveCartToLocalStorage() {
    try {
        localStorage.setItem('jj_cart', JSON.stringify(cart));
    } catch (e) {
        console.warn('Could not save cart to localStorage:', e);
    }
}

// 1. Add to Cart (supports custom options, color variations, custom quantity & auto accumulation)
function addToCart(name, price, colorGroupName, productId, optionName, quantity = 1, directOptionsText = null, directColorText = null) {
    // 🔐 Check if user is logged in
    if (localStorage.getItem('jj_loggedIn') !== 'true') {
        if (confirm("You need to login first to add items to cart.\n\nGo to Login page?")) {
            window.location.href = 'login/login.html';
        }
        return;
    }

    const addQty = Math.max(1, parseInt(quantity, 10) || 1);

    // 1. Determine selected options string (e.g. " (Size: XL, Type: Wireless)")
    let selectedOption = "";
    if (directOptionsText !== null && directOptionsText !== undefined) {
        selectedOption = directOptionsText;
    } else if (productId && window.jj_selected_variants && window.jj_selected_variants[productId]) {
        const parts = [];
        const optObj = window.jj_selected_variants[productId];
        for (const [k, v] of Object.entries(optObj)) {
            if (v) parts.push(`${k}: ${v}`);
        }
        if (parts.length > 0) {
            selectedOption = ` (${parts.join(', ')})`;
        }
    } else if (productId && optionName) {
        const optEl = document.getElementById('opt_prod_' + productId);
        if (optEl && optEl.value) {
            selectedOption = ` (${optionName}: ${optEl.value})`;
        }
    }

    // 2. Determine selected color string (e.g. " (ពណ៌: Black)")
    let selectedColor = "";
    if (directColorText !== null && directColorText !== undefined) {
        selectedColor = directColorText;
    } else if (colorGroupName) {
        const colorInput = document.querySelector('input[name="' + colorGroupName + '"]:checked');
        if (colorInput && colorInput.value) {
            selectedColor = " (ពណ៌: " + colorInput.value + ")";
        }
    }

    const finalName = name + selectedOption + selectedColor;
    const itemPrice = parseFloat(price) || 0;
    const parsedProdId = productId ? parseInt(productId, 10) : null;
    const existingItem = cart.find(item => item.name === finalName);

    if (existingItem) {
        existingItem.quantity = (parseInt(existingItem.quantity, 10) || 0) + addQty;
        if (!existingItem.productId && parsedProdId) {
            existingItem.productId = parsedProdId;
        }
    } else {
        cart.push({
            productId: parsedProdId,
            name: finalName,
            price: itemPrice,
            quantity: addQty
        });
    }

    saveCartToLocalStorage();
    updateCartUI();

    // Smoothly open the cart sidebar without redirecting
    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar) {
        sidebar.classList.add('open');
    }
}

// 2. Add or Subtract item quantity (+ / -)
function updateQuantity(index, change) {
    const idx = parseInt(index, 10);
    if (isNaN(idx) || !cart[idx]) return;

    const currentQty = parseInt(cart[idx].quantity, 10) || 1;
    const delta = parseInt(change, 10);
    const newQty = currentQty + delta;

    if (newQty <= 0) {
        // If reduced to 0 or below, remove item from cart
        cart.splice(idx, 1);
    } else {
        cart[idx].quantity = newQty;
    }

    saveCartToLocalStorage();
    updateCartUI();
}

// 3. Render Cart UI Data & Quantities
function updateCartUI() {
    const countEl = document.getElementById('cart-count');
    const itemsEl = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    const checkoutTotalEl = document.getElementById('checkout-total-price');

    // Total item count across all items
    const totalItems = cart.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
    if (countEl) countEl.innerText = totalItems;

    // Total price
    const totalPrice = cart.reduce((sum, item) => {
        const qty = parseInt(item.quantity, 10) || 0;
        const price = parseFloat(item.price) || 0;
        return sum + (price * qty);
    }, 0);

    const formattedTotal = totalPrice.toFixed(2);

    if (itemsEl) {
        if (cart.length === 0) {
            itemsEl.innerHTML = '<p style="text-align:center; color:#94a3b8; padding: 40px 0; font-size: 15px; font-weight: 600;">Your cart is currently empty.</p>';
        } else {
            let html = '';
            cart.forEach((item, index) => {
                const qty = parseInt(item.quantity, 10) || 1;
                const unitPrice = parseFloat(item.price) || 0;
                const itemTotal = (unitPrice * qty).toFixed(2);

                html += `
                    <div class="cart-item">
                        <div class="item-info">
                            <span class="item-name">${item.name}</span>
                            <span class="item-price">$${itemTotal}</span>
                        </div>
                        <div class="qty-controls">
                            <button type="button" class="qty-btn qty-minus" onclick="updateQuantity(${index}, -1)" title="Subtract 1" aria-label="Subtract quantity">−</button>
                            <span class="qty-num">${qty}</span>
                            <button type="button" class="qty-btn qty-plus" onclick="updateQuantity(${index}, 1)" title="Add 1" aria-label="Add quantity">+</button>
                        </div>
                    </div>
                `;
            });
            itemsEl.innerHTML = html;
        }
    }

    if (totalEl) totalEl.innerText = formattedTotal;
    if (checkoutTotalEl) checkoutTotalEl.innerText = formattedTotal;
}

// 4. Toggle Cart Sidebar
function toggleCart() {
    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

// Auto initialize Cart UI on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateCartUI);
} else {
    updateCartUI();
}
