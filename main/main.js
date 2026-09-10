// ==========================================================================
// JingJang Store — Main Catalog, Search & Product Previews (main.js)
// ==========================================================================

const CACHE_KEY_PRODUCTS = 'jj_cached_products';
const CACHE_KEY_FILTER = 'jj_cached_filter';

let productData = [];
let isFetchingProducts = false;
let currentFilter = 'ALL';
let categorySearchQuery = '';

// Synchronously restore cached products & filter immediately on script evaluation
try {
    const saved = localStorage.getItem(CACHE_KEY_PRODUCTS);
    if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
            productData = parsed;
        }
    }
} catch (e) {
    console.warn('Could not read cached products:', e);
}

try {
    const savedFilter = localStorage.getItem(CACHE_KEY_FILTER);
    if (savedFilter) currentFilter = savedFilter;
} catch (e) { }

// Preload product images into memory cache immediately
function preloadProductImages(products) {
    if (!Array.isArray(products) || products.length === 0) return;
    products.forEach(p => {
        if (Array.isArray(p.images)) {
            p.images.forEach(url => {
                if (url && typeof url === 'string') {
                    const img = new Image();
                    img.src = url;
                }
            });
        }
    });
}

// Immediately warm image cache for cached products
if (productData.length > 0) {
    preloadProductImages(productData);
}

// ============================================================
// IMAGE SLIDER (WITH SESSION PERSISTENCE & DOT INDICATORS)
// ============================================================
function moveSlide(button, direction, productId) {
    const sliderContainer = button.parentElement;
    const slides = sliderContainer.querySelectorAll('.slide');
    const dots = sliderContainer.querySelectorAll('.slider-dot');

    if (!slides || slides.length === 0) return;

    let currentIndex = 0;
    for (let i = 0; i < slides.length; i++) {
        if (slides[i].classList.contains('active')) {
            currentIndex = i;
            slides[i].classList.remove('active');
            if (dots[i]) dots[i].classList.remove('active');
            break;
        }
    }

    let nextIndex = currentIndex + direction;
    if (nextIndex >= slides.length) {
        nextIndex = 0;
    } else if (nextIndex < 0) {
        nextIndex = slides.length - 1;
    }

    slides[nextIndex].classList.add('active');
    if (dots[nextIndex]) dots[nextIndex].classList.add('active');

    // Remember the user's active slide so refresh doesn't reset it
    if (productId) {
        try {
            sessionStorage.setItem('jj_slide_' + productId, nextIndex);
        } catch (e) { }
    }
}

// ============================================================
// LIVE CATEGORY & PRODUCT SEARCH
// ============================================================
function handleCategorySearch(val) {
    categorySearchQuery = (val || '').trim().toLowerCase();
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) {
        clearBtn.style.display = categorySearchQuery.length > 0 ? 'inline-flex' : 'none';
    }
    renderProducts();
}

function triggerCategorySearch() {
    const input = document.getElementById('store-search-input');
    if (input) {
        handleCategorySearch(input.value);
    }
}

function clearCategorySearch() {
    const input = document.getElementById('store-search-input');
    if (input) {
        input.value = '';
        input.focus();
    }
    handleCategorySearch('');
}

// ============================================================
// EMAILJS CONTACT FORM HANDLER
// ============================================================
function sendMessage(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Sending...';
    }

    emailjs.sendForm('service_jhndxtb', 'template_gxxvf9e', form)
        .then(() => {
            alert('សាររបស់អ្នកត្រូវបានផ្ញើ! Your message has been sent.');
            form.reset();
        })
        .catch(() => alert('មានបញ្ហា សូមព្យាយាមម្តងទៀត!'))
        .finally(() => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'ផ្ញើសារ (Send Message)';
            }
        });

    return false;
}

// ============================================================
// GLOBAL SELECTION REGISTRY FOR VARIANT PILLS
// { [productId]: { [optionName]: selectedValue } }
// ============================================================
window.jj_selected_variants = window.jj_selected_variants || {};

function selectCardOptionPill(btn, productId, optName, optVal, e) {
    if (e) e.stopPropagation();
    const parentRow = btn.parentElement;
    parentRow.querySelectorAll('.option-choice-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (!window.jj_selected_variants[productId]) window.jj_selected_variants[productId] = {};
    window.jj_selected_variants[productId][optName] = optVal;

    const safeId = optName.replace(/[^a-zA-Z0-9]/g, '_');
    const badge = document.getElementById(`lbl_opt_${productId}_${safeId}`);
    if (badge) badge.textContent = optVal;
}

// ============================================================
// SINGLE PRODUCT CARD PREVIEW GENERATOR
// ============================================================
function renderSingleProductCard(product) {
    const images = (product.images && product.images.length > 0)
        ? product.images
        : ['img/IMG_3840.PNG'];

    // Restore saved slide index for this product
    let activeSlideIndex = 0;
    try {
        const savedSlide = parseInt(sessionStorage.getItem('jj_slide_' + product.id), 10);
        if (!isNaN(savedSlide) && savedSlide >= 0 && savedSlide < images.length) {
            activeSlideIndex = savedSlide;
        }
    } catch (e) { }

    const imagesHtml = images.map((img, index) => {
        const altText = index === 0 ? 'Front' : (index === 1 ? 'Back' : 'Side');
        const activeClass = index === activeSlideIndex ? 'active' : '';
        const loadingAttr = index === activeSlideIndex ? 'loading="eager" decoding="async"' : 'loading="lazy" decoding="async"';
        return `<img src="${img}" alt="${product.name} - ${altText}" class="slide ${activeClass}" ${loadingAttr} onerror="this.onerror=null;this.src='img/IMG_3840.PNG';">`;
    }).join('');

    const sliderButtons = images.length > 1 ? `
        <button class="slider-btn prev" onclick="event.stopPropagation(); moveSlide(this, -1, ${product.id})" aria-label="Previous image">&#10094;</button>
        <button class="slider-btn next" onclick="event.stopPropagation(); moveSlide(this, 1, ${product.id})" aria-label="Next image">&#10095;</button>
        <div class="slider-dots">
            ${images.map((_, i) => `<span class="slider-dot ${i === activeSlideIndex ? 'active' : ''}"></span>`).join('')}
        </div>
    ` : '';

    const categoryTag = product.category_name || product.type || 'Tech';
    const specs = Array.isArray(product.specs) ? product.specs : [];
    const specsHtml = specs.map(spec => `<p class="specs" title="${spec}">${spec}</p>`).join('');

    const colors = Array.isArray(product.colors) ? product.colors : [];
    const colorName = product.colorName || product.color_name || `color_prod_${product.id}`;
    const cartName = (product.cartName || product.cart_name || product.name).replace(/'/g, "\\'");
    const formattedPrice = Number(product.price).toFixed(2);

    let selectedColorVal = null;
    try {
        selectedColorVal = sessionStorage.getItem('jj_color_' + product.id);
    } catch (e) { }

    const colorsHtml = colors.map((c, index) => {
        const colorVal = c.value || c.name || 'Default';
        const checked = selectedColorVal
            ? (selectedColorVal === colorVal ? 'checked' : '')
            : (index === 0 ? 'checked' : '');
        const borderStyle = c.border ? 'border: 1px solid #cbd5e1;' : '';
        const colorCode = c.colorCode || c.color || '#2c2c2c';
        return `
            <input type="radio" name="${colorName}" id="color_${colorVal}_${colorName}" value="${colorVal}" ${checked} onclick="event.stopPropagation();" onchange="try{sessionStorage.setItem('jj_color_${product.id}', this.value)}catch(e){}">
            <label for="color_${colorVal}_${colorName}" class="color-swatch" style="background-color: ${colorCode}; ${borderStyle}" title="${colorVal}" onclick="event.stopPropagation();"></label>
        `;
    }).join('');

    // Multi-option groups ("choose not select")
    let productOptions = [];
    if (Array.isArray(product.options) && product.options.length > 0) {
        productOptions = product.options;
    } else if (Array.isArray(product.option_values) && product.option_values.length > 0) {
        if (typeof product.option_values[0] === 'object' && product.option_values[0].name) {
            productOptions = product.option_values;
        } else if (product.option_name) {
            productOptions = [{ name: product.option_name, values: product.option_values }];
        }
    }

    let optionsPillsHtml = '';
    if (productOptions.length > 0) {
        optionsPillsHtml = `
        <div class="product-options-container" onclick="event.stopPropagation();">
            ${productOptions.map(opt => {
                const optName = opt.name || 'Option';
                const vals = Array.isArray(opt.values) ? opt.values : [];
                if (vals.length === 0) return '';

                if (!window.jj_selected_variants[product.id]) window.jj_selected_variants[product.id] = {};
                if (!window.jj_selected_variants[product.id][optName]) {
                    window.jj_selected_variants[product.id][optName] = vals[0];
                }
                const curVal = window.jj_selected_variants[product.id][optName];
                const safeId = optName.replace(/[^a-zA-Z0-9]/g, '_');

                return `
                <div class="option-pill-group">
                    <span class="option-pill-title">${optName}: <strong id="lbl_opt_${product.id}_${safeId}">${curVal}</strong></span>
                    <div class="option-pills-row">
                        ${vals.map(val => `
                            <button type="button" 
                                    class="option-choice-pill ${val === curVal ? 'active' : ''}" 
                                    data-prod-id="${product.id}"
                                    data-opt-name="${optName}"
                                    data-opt-val="${val}"
                                    onclick="selectCardOptionPill(this, ${product.id}, '${optName.replace(/'/g, "\\'")}', '${val.replace(/'/g, "\\'")}', event)">
                                ${val}
                            </button>
                        `).join('')}
                    </div>
                </div>
                `;
            }).join('')}
        </div>
        `;
    }

    return `
    <div class="product-card" data-product-id="${product.id}">
        <div class="image-slider" onclick="openProductPreviewModal(${product.id})" style="cursor: pointer;" title="Tap to preview large product & details">
            <span class="product-category-badge">${categoryTag}</span>
            ${imagesHtml}
            ${sliderButtons}
            <div class="preview-zoom-hint">🔍 Quick View</div>
        </div>
        <div class="product-info">
            <h3 onclick="openProductPreviewModal(${product.id})" style="cursor: pointer;" title="Tap to preview large product & details">${product.name}</h3>
            ${specsHtml}
            <div class="price-row">
                <span class="price">$${formattedPrice}</span>
                <span class="preorder-tag">🇨🇳 Pre-Order</span>
            </div>
            ${colors.length > 0 ? `
            <div class="color-selection" onclick="event.stopPropagation();">
                <div class="color-options">
                    ${colorsHtml}
                </div>
            </div>` : ''}
            ${optionsPillsHtml}
            <button class="add-to-cart" onclick="event.stopPropagation(); addToCart('${cartName}', ${product.price}, '${colorName}', ${product.id})">
                <span class="cart-btn-icon">🛍️</span> Add to Cart
            </button>
        </div>
    </div>
    `;
}

// ============================================================
// PRODUCT PREVIEW MODAL (LARGE ALONE PREVIEW & FULL DETAILS)
// ============================================================
window.jj_modal_state = null;

function openProductPreviewModal(productId) {
    const product = productData.find(p => String(p.id) === String(productId));
    if (!product) return;

    let modalOverlay = document.getElementById('product-preview-modal-overlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'product-preview-modal-overlay';
        modalOverlay.className = 'product-preview-modal-overlay';
        modalOverlay.innerHTML = '<div class="product-preview-modal-card" id="product-preview-modal-card"></div>';
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeProductPreviewModal();
        });
        document.body.appendChild(modalOverlay);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeProductPreviewModal();
        });
    }

    const card = document.getElementById('product-preview-modal-card');
    const images = (product.images && product.images.length > 0) ? product.images : ['img/IMG_3840.PNG'];
    const categoryTag = product.category_name || product.type || 'Tech';
    const specs = Array.isArray(product.specs) ? product.specs : [];
    const colors = Array.isArray(product.colors) ? product.colors : [];
    const colorName = `modal_color_${product.id}`;
    const formattedPrice = Number(product.price).toFixed(2);

    let productOptions = [];
    if (Array.isArray(product.options) && product.options.length > 0) {
        productOptions = product.options;
    } else if (Array.isArray(product.option_values) && product.option_values.length > 0) {
        if (typeof product.option_values[0] === 'object' && product.option_values[0].name) {
            productOptions = product.option_values;
        } else if (product.option_name) {
            productOptions = [{ name: product.option_name, values: product.option_values }];
        }
    }

    // Modal state
    window.jj_modal_state = {
        productId: product.id,
        product: product,
        images: images,
        currentImageIndex: 0,
        qty: 1,
        colorName: colorName
    };

    // Build specs HTML
    const specsHtml = specs.length > 0 ? `
        <div class="modal-specs-card">
            <div class="modal-specs-title">Specifications</div>
            <ul class="modal-specs-list">
                ${specs.map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>
    ` : '';

    // Build colors HTML
    let colorsHtml = '';
    if (colors.length > 0) {
        colorsHtml = `
        <div class="modal-option-unit">
            <label>Color Variation:</label>
            <div style="display:flex; gap:10px; align-items:center;">
                ${colors.map((c, idx) => {
                    const cVal = c.value || c.name || 'Default';
                    const cCode = c.colorCode || c.color || '#2c2c2c';
                    const border = c.border ? 'border: 1.5px solid #cbd5e1;' : '';
                    return `
                    <label style="cursor:pointer; display:flex; align-items:center;">
                        <input type="radio" name="${colorName}" value="${cVal}" ${idx === 0 ? 'checked' : ''} style="margin-right:4px;">
                        <span class="color-swatch" style="background-color:${cCode}; ${border}" title="${cVal}"></span>
                    </label>
                    `;
                }).join('')}
            </div>
        </div>
        `;
    }

    // Build multi-options HTML ("choose not select")
    let optionsHtml = '';
    if (productOptions.length > 0) {
        optionsHtml = productOptions.map(opt => {
            const optName = opt.name || 'Option';
            const vals = Array.isArray(opt.values) ? opt.values : [];
            if (vals.length === 0) return '';

            if (!window.jj_selected_variants[product.id]) window.jj_selected_variants[product.id] = {};
            if (!window.jj_selected_variants[product.id][optName]) {
                window.jj_selected_variants[product.id][optName] = vals[0];
            }
            const curVal = window.jj_selected_variants[product.id][optName];
            const safeId = optName.replace(/[^a-zA-Z0-9]/g, '_');

            return `
            <div class="modal-option-unit">
                <label>${optName}: <strong id="modal_lbl_opt_${safeId}" style="color:#0f172a; font-weight:800; background:#e2e8f0; padding:1px 7px; border-radius:4px;">${curVal}</strong></label>
                <div class="option-pills-row">
                    ${vals.map(val => `
                        <button type="button" 
                                class="option-choice-pill ${val === curVal ? 'active' : ''}" 
                                onclick="selectModalOptionPill(this, ${product.id}, '${optName.replace(/'/g, "\\'")}', '${val.replace(/'/g, "\\'")}')">
                            ${val}
                        </button>
                    `).join('')}
                </div>
            </div>
            `;
        }).join('');
    }

    // Thumbnails
    const thumbsHtml = images.length > 1 ? `
        <div class="modal-thumbs-row">
            ${images.map((img, i) => `
                <img src="${img}" class="modal-thumb-img ${i === 0 ? 'active' : ''}" 
                     onclick="setModalImage(${i})" alt="Thumb ${i + 1}">
            `).join('')}
        </div>
    ` : '';

    const navArrows = images.length > 1 ? `
        <button class="modal-nav-arrow prev" onclick="stepModalImage(-1)">&lsaquo;</button>
        <button class="modal-nav-arrow next" onclick="stepModalImage(1)">&rsaquo;</button>
    ` : '';

    card.innerHTML = `
        <button type="button" class="modal-close-btn" onclick="closeProductPreviewModal()">&times;</button>
        
        <div class="modal-gallery-col">
            <div class="modal-stage-wrap">
                <img src="${images[0]}" id="modal-stage-img" class="modal-stage-img" alt="${product.name}">
                ${navArrows}
            </div>
            ${thumbsHtml}
        </div>

        <div class="modal-details-col">
            <span class="modal-cat-tag">${categoryTag}</span>
            <h2 class="modal-prod-title">${product.name}</h2>

            <div class="modal-price-strip">
                <span class="modal-price-val">$${formattedPrice}</span>
                <span class="preorder-tag">🇨🇳 Pre-Order</span>
            </div>

            ${specsHtml}

            <div class="modal-options-block">
                ${colorsHtml}
                ${optionsHtml}
            </div>

            <div class="modal-actions-row">
                <div class="modal-qty-box">
                    <button type="button" class="modal-qty-btn" onclick="stepModalQty(-1)">&minus;</button>
                    <input type="text" id="modal-qty-input" class="modal-qty-num" value="1" readonly>
                    <button type="button" class="modal-qty-btn" onclick="stepModalQty(1)">&plus;</button>
                </div>

                <button type="button" class="modal-add-cart-btn" id="modal-add-to-cart-btn" onclick="submitModalAddToCart()">
                    <span>🛍️</span>
                    <span>Add to Cart &bull; $<span id="modal-btn-price">${formattedPrice}</span></span>
                </button>
            </div>
        </div>
    `;

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeProductPreviewModal() {
    const modalOverlay = document.getElementById('product-preview-modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
    document.body.style.overflow = '';
}

function setModalImage(idx) {
    if (!window.jj_modal_state) return;
    const { images } = window.jj_modal_state;
    if (idx < 0 || idx >= images.length) return;
    window.jj_modal_state.currentImageIndex = idx;

    const imgEl = document.getElementById('modal-stage-img');
    if (imgEl) imgEl.src = images[idx];

    const thumbs = document.querySelectorAll('.modal-thumb-img');
    thumbs.forEach((t, i) => t.classList.toggle('active', i === idx));
}

function stepModalImage(dir) {
    if (!window.jj_modal_state) return;
    const { images, currentImageIndex } = window.jj_modal_state;
    let nextIdx = (currentImageIndex + dir + images.length) % images.length;
    setModalImage(nextIdx);
}

function stepModalQty(delta) {
    if (!window.jj_modal_state) return;
    let qty = window.jj_modal_state.qty + delta;
    if (qty < 1) qty = 1;
    if (qty > 99) qty = 99;
    window.jj_modal_state.qty = qty;

    const qtyInput = document.getElementById('modal-qty-input');
    if (qtyInput) qtyInput.value = qty;

    const priceSpan = document.getElementById('modal-btn-price');
    if (priceSpan && window.jj_modal_state.product) {
        const total = (parseFloat(window.jj_modal_state.product.price) * qty).toFixed(2);
        priceSpan.textContent = total;
    }
}

function selectModalOptionPill(btn, productId, optName, optVal) {
    const parentRow = btn.parentElement;
    parentRow.querySelectorAll('.option-choice-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (!window.jj_selected_variants[productId]) window.jj_selected_variants[productId] = {};
    window.jj_selected_variants[productId][optName] = optVal;

    const safeId = optName.replace(/[^a-zA-Z0-9]/g, '_');
    const badge = document.getElementById(`modal_lbl_opt_${safeId}`);
    if (badge) badge.textContent = optVal;

    // Sync back to card on main grid if present
    const cardBadge = document.getElementById(`lbl_opt_${productId}_${safeId}`);
    if (cardBadge) cardBadge.textContent = optVal;
    const cardBtn = document.querySelector(`.option-choice-pill[data-prod-id="${productId}"][data-opt-name="${optName}"][data-opt-val="${optVal}"]`);
    if (cardBtn) {
        cardBtn.parentElement.querySelectorAll('.option-choice-pill').forEach(b => b.classList.remove('active'));
        cardBtn.classList.add('active');
    }
}

function submitModalAddToCart() {
    if (!window.jj_modal_state) return;
    const { product, qty, colorName } = window.jj_modal_state;

    const cartName = product.cartName || product.cart_name || product.name;
    const price = product.price;

    // Direct color
    let directColor = "";
    const colorInput = document.querySelector(`input[name="${colorName}"]:checked`);
    if (colorInput && colorInput.value) {
        directColor = ` (ពណ៌: ${colorInput.value})`;
    }

    addToCart(cartName, price, null, product.id, null, qty, null, directColor);

    const btn = document.getElementById('modal-add-to-cart-btn');
    if (btn) {
        btn.innerHTML = '<span>✅</span><span>Added to Cart!</span>';
        setTimeout(() => {
            closeProductPreviewModal();
        }, 400);
    }
}

// ============================================================
// DYNAMIC PRODUCT DATA FROM API
// ============================================================
async function fetchProductsFromAPI() {
    if (isFetchingProducts) return;
    isFetchingProducts = true;

    try {
        const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE)
            ? CONFIG.API_BASE
            : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
                ? 'http://localhost:3000'
                : 'https://jingjang-store-backend.onrender.com');

        const response = await fetch(`${apiBase}/products`);
        const result = await response.json();

        if (result.status === 'success' && Array.isArray(result.data)) {
            syncProductsIncremental(result.data);
        } else {
            console.warn('Could not load products from API:', result);
        }
    } catch (err) {
        console.error('Error connecting to products API:', err);
    } finally {
        isFetchingProducts = false;
        const grid = document.querySelector('.product-grid');
        if (grid && !grid.querySelector('.product-card') && productData.length > 0) {
            renderProducts();
        }
    }
}

function syncProductsIncremental(newProducts) {
    const grid = document.querySelector('.product-grid');
    const oldJson = JSON.stringify(productData);
    const newJson = JSON.stringify(newProducts);

    if (oldJson === newJson && grid && grid.querySelector('.product-card')) {
        return;
    }

    productData = newProducts;
    try {
        localStorage.setItem(CACHE_KEY_PRODUCTS, newJson);
    } catch (e) { }

    renderCategoryFilters();
    renderProducts();
    preloadProductImages(productData);
}

function filterProducts(type) {
    currentFilter = type;
    try {
        localStorage.setItem(CACHE_KEY_FILTER, type);
    } catch (e) { }

    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        const btnText = btn.innerText.trim();
        if (btnText.toLowerCase() === type.toLowerCase() || (btnText === 'ALL' && type === 'ALL')) {
            btn.classList.add('active');
            try {
                btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } catch (e) { }
        } else {
            btn.classList.remove('active');
        }
    });

    renderProducts();
}

function renderCategoryFilters() {
    const filterContainer = document.querySelector('.product-filter');
    if (!filterContainer || productData.length === 0) return;

    const types = Array.from(new Set(productData.map(p => (p.category_name || p.type || '').trim()).filter(Boolean)));

    let html = `<button class="filter-btn ${currentFilter === 'ALL' ? 'active' : ''}" onclick="filterProducts('ALL')">ALL</button>`;
    types.forEach(t => {
        const isActive = currentFilter.toLowerCase() === t.toLowerCase() ? 'active' : '';
        html += `<button class="filter-btn ${isActive}" onclick="filterProducts('${t}')">${t}</button>`;
    });

    filterContainer.innerHTML = html;
}

// Master Render Function
function renderProducts() {
    renderCategoryFilters();
    const grid = document.querySelector('.product-grid');
    if (!grid) return;

    if (productData.length === 0) {
        if (isFetchingProducts) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                    <div style="display:inline-block; width: 36px; height: 36px; border: 3px solid #e2e8f0; border-top-color: #2ecc71; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <p style="margin-top: 15px; font-weight: 600; color: #64748b;">Loading products from JingJang Store...</p>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                </div>
            `;
            return;
        } else {
            fetchProductsFromAPI();
            return;
        }
    }

    // Filter by Category
    let filtered = currentFilter === 'ALL'
        ? productData
        : productData.filter(p => {
            const pType = (p.category_name || p.type || '').toLowerCase();
            return pType === currentFilter.toLowerCase();
        });

    // Filter by Search Query
    if (categorySearchQuery) {
        filtered = filtered.filter(p => {
            const nameMatch = (p.name || '').toLowerCase().includes(categorySearchQuery);
            const typeMatch = (p.type || p.category_name || '').toLowerCase().includes(categorySearchQuery);
            const specsMatch = Array.isArray(p.specs) && p.specs.some(s => s.toLowerCase().includes(categorySearchQuery));
            return nameMatch || typeMatch || specsMatch;
        });
    }

    // Ensure section title is never populated with text like "Stand Collection (1 items)" or Search Results
    const titleEl = document.querySelector('.section-title');
    if (titleEl) {
        titleEl.textContent = '';
        titleEl.style.display = 'none';
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: #ffffff; border-radius: 16px; border: 1px dashed #cbd5e1;">
                <p style="font-size: 36px; margin-bottom: 12px;">🔍</p>
                <p style="font-size: 18px; font-weight: 700; color: #334155; margin-bottom: 6px;">No products found</p>
                <p style="font-size: 14px; color: #64748b; margin-bottom: 16px;">We couldn't find any products matching your search.</p>
                <button type="button" onclick="clearCategorySearch(); filterProducts('ALL');" style="padding: 10px 20px; background: #3b665b; color: #ffffff; border: none; border-radius: 20px; font-weight: 700; cursor: pointer;">Show All Products</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(product => renderSingleProductCard(product)).join('');
}

// Self-initializing lifecycle
function initStoreProducts() {
    if (document.querySelector('.product-grid')) {
        renderProducts();
    }
    fetchProductsFromAPI();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStoreProducts);
} else {
    initStoreProducts();
}
