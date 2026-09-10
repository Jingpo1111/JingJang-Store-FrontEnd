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
        <button class="slider-btn prev" onclick="moveSlide(this, -1, ${product.id})" aria-label="Previous image">&#10094;</button>
        <button class="slider-btn next" onclick="moveSlide(this, 1, ${product.id})" aria-label="Next image">&#10095;</button>
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
            <input type="radio" name="${colorName}" id="color_${colorVal}_${colorName}" value="${colorVal}" ${checked} onchange="try{sessionStorage.setItem('jj_color_${product.id}', this.value)}catch(e){}">
            <label for="color_${colorVal}_${colorName}" class="color-swatch" style="background-color: ${colorCode}; ${borderStyle}" title="${colorVal}"></label>
        `;
    }).join('');

    return `
    <div class="product-card" data-product-id="${product.id}">
        <div class="image-slider">
            <span class="product-category-badge">${categoryTag}</span>
            ${imagesHtml}
            ${sliderButtons}
        </div>
        <div class="product-info">
            <h3 title="${product.name}">${product.name}</h3>
            ${specsHtml}
            <div class="price-row">
                <span class="price">$${formattedPrice}</span>
                <span class="preorder-tag">🇨🇳 Pre-Order</span>
            </div>
            ${colors.length > 0 ? `
            <div class="color-selection">
                <div class="color-options">
                    ${colorsHtml}
                </div>
            </div>` : ''}
            <button class="add-to-cart" onclick="addToCart('${cartName}', ${product.price}, '${colorName}')">
                <span class="cart-btn-icon">🛍️</span> Add to Cart
            </button>
        </div>
    </div>
    `;
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
