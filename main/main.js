// main.js

// ============================================================
// CONSTANTS & STATE
// ============================================================
const CACHE_KEY_PRODUCTS = 'jj_cached_products';
const CACHE_KEY_FILTER = 'jj_cached_filter';

let productData = [];
let isFetchingProducts = false;
let currentFilter = 'ALL';

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
} catch (e) {}

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
// IMAGE SLIDER (WITH SESSION PERSISTENCE)
// ============================================================
function moveSlide(button, direction, productId) {
    const sliderContainer = button.parentElement;
    const slides = sliderContainer.querySelectorAll('.slide');

    if (!slides || slides.length === 0) return;

    let currentIndex = 0;

    for (let i = 0; i < slides.length; i++) {
        if (slides[i].classList.contains('active')) {
            currentIndex = i;
            slides[i].classList.remove('active');
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

    // Remember the user's active slide so refresh doesn't reset it
    if (productId) {
        try {
            sessionStorage.setItem('jj_slide_' + productId, nextIndex);
        } catch (e) {}
    }
}

// ============================================================
// EMAILJS CONTACT FORM HANDLER
// ============================================================
function sendMessage(event) {
    event.preventDefault();
    const form = event.target;

    emailjs.sendForm('service_jhndxtb', 'template_gxxvf9e', form)
        .then(() => {
            alert('សាររបស់អ្នកត្រូវបានផ្ញើ!');
            form.reset();
        })
        .catch(() => alert('មានបញ្ហា សូមព្យាយាមម្តងទៀត!'));

    return false;
}

// ============================================================
// SINGLE PRODUCT CARD HTML GENERATOR
// ============================================================
function renderSingleProductCard(product) {
    const images = (product.images && product.images.length > 0) 
        ? product.images 
        : ['img/IMG_3840.PNG'];

    // Restore saved slide index for this product if user moved it earlier
    let activeSlideIndex = 0;
    try {
        const savedSlide = parseInt(sessionStorage.getItem('jj_slide_' + product.id), 10);
        if (!isNaN(savedSlide) && savedSlide >= 0 && savedSlide < images.length) {
            activeSlideIndex = savedSlide;
        }
    } catch (e) {}

    const imagesHtml = images.map((img, index) => {
        const altText = index === 0 ? 'Front' : (index === 1 ? 'Back' : 'Side');
        const activeClass = index === activeSlideIndex ? 'active' : '';
        const loadingAttr = index === activeSlideIndex ? 'loading="eager" decoding="async"' : 'loading="lazy" decoding="async"';
        return `<img src="${img}" alt="${altText}" class="slide ${activeClass}" ${loadingAttr} onerror="this.onerror=null;this.src='img/IMG_3840.PNG';">`;
    }).join('');

    const sliderButtons = images.length > 1 ? `
        <button class="slider-btn prev" onclick="moveSlide(this, -1, ${product.id})">&#10094;</button>
        <button class="slider-btn next" onclick="moveSlide(this, 1, ${product.id})">&#10095;</button>
    ` : '';

    const specs = Array.isArray(product.specs) ? product.specs : [];
    const specsHtml = specs.map(spec => `<p class="specs">${spec}</p>`).join('');

    const colors = Array.isArray(product.colors) ? product.colors : [];
    const colorName = product.colorName || product.color_name || `color_prod_${product.id}`;
    const cartName = (product.cartName || product.cart_name || product.name).replace(/'/g, "\\'");

    let selectedColorVal = null;
    try {
        selectedColorVal = sessionStorage.getItem('jj_color_' + product.id);
    } catch (e) {}

    const colorsHtml = colors.map((c, index) => {
        const colorVal = c.value || c.name || 'Default';
        const checked = selectedColorVal 
            ? (selectedColorVal === colorVal ? 'checked' : '') 
            : (index === 0 ? 'checked' : '');
        const borderStyle = c.border ? 'border: 1px solid #ddd;' : '';
        const colorCode = c.colorCode || c.color || '#2c2c2c';
        return `
            <input type="radio" name="${colorName}" id="color_${colorVal}_${colorName}" value="${colorVal}" ${checked} onchange="try{sessionStorage.setItem('jj_color_${product.id}', this.value)}catch(e){}">
            <label for="color_${colorVal}_${colorName}" class="color-swatch" style="background-color: ${colorCode}; ${borderStyle}"></label>
        `;
    }).join('');

    return `
    <div class="product-card" data-product-id="${product.id}">
        <div class="image-slider">
            ${imagesHtml}
            ${sliderButtons}
        </div>
        <div class="product-info">
            <h3>${product.name}</h3>
            ${specsHtml}
            <p class="price">$${product.price}</p>
            <div class="color-selection">
                <div class="color-options">
                    ${colorsHtml}
                </div>
            </div>
            <button class="add-to-cart" onclick="addToCart('${cartName}', ${product.price}, '${colorName}')">Add to Cart</button>
        </div>
    </div>
    `;
}

// ============================================================
// DYNAMIC PRODUCT DATA (LOADED FROM BACKEND API WITH INCREMENTAL DIFF)
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
        // If grid exists and has no product cards (e.g. first-time cold visit), render now
        const grid = document.querySelector('.product-grid');
        if (grid && !grid.querySelector('.product-card') && productData.length > 0) {
            renderProducts();
        }
    }
}

/**
 * Smart incremental synchronization:
 * - If data is unchanged: does NOT touch the DOM (existing images & slides remain stable)
 * - If NEW products exist: surgically adds only the new product cards without reloading existing ones
 * - If products were removed: removes only deleted cards
 */
function syncProductsIncremental(newProducts) {
    const grid = document.querySelector('.product-grid');
    const oldJson = JSON.stringify(productData);
    const newJson = JSON.stringify(newProducts);

    // 1. If exact match and cards are already on page, do not touch DOM
    if (oldJson === newJson && grid && grid.querySelector('.product-card')) {
        return;
    }

    // 2. If grid is not yet mounted or was completely empty, do a full initial render
    if (!grid || !grid.querySelector('.product-card') || productData.length === 0) {
        productData = newProducts;
        try {
            localStorage.setItem(CACHE_KEY_PRODUCTS, newJson);
        } catch (e) {}
        renderProducts();
        preloadProductImages(productData);
        return;
    }

    // 3. Incremental Diff:
    const oldMap = new Map(productData.map(p => [p.id, p]));
    const newMap = new Map(newProducts.map(p => [p.id, p]));

    // Check for removed products
    productData.forEach(p => {
        if (!newMap.has(p.id)) {
            const card = grid.querySelector(`.product-card[data-product-id="${p.id}"]`);
            if (card) card.remove();
        }
    });

    // Check for updated products (e.g. price, name, specs changed)
    newProducts.forEach(newP => {
        const oldP = oldMap.get(newP.id);
        if (oldP && JSON.stringify(oldP) !== JSON.stringify(newP)) {
            const existingCard = grid.querySelector(`.product-card[data-product-id="${newP.id}"]`);
            if (existingCard) {
                // Replace only this specific card's HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = renderSingleProductCard(newP).trim();
                const newCard = tempDiv.firstElementChild;
                grid.replaceChild(newCard, existingCard);
            }
        }
    });

    // Check for brand NEW products (present in newProducts but not in productData)
    const newlyAddedProducts = newProducts.filter(p => !oldMap.has(p.id));
    if (newlyAddedProducts.length > 0) {
        // Preload images for the new items
        preloadProductImages(newlyAddedProducts);

        // Prepend/insert new cards surgically into the grid without touching existing ones
        newlyAddedProducts.forEach(newP => {
            const pType = (newP.type || newP.category_name || '').toLowerCase();
            const matchesFilter = currentFilter === 'ALL' || pType === currentFilter.toLowerCase();

            if (matchesFilter) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = renderSingleProductCard(newP).trim();
                const newCard = tempDiv.firstElementChild;
                
                // Add smooth subtle entrance for newly arrived product
                newCard.style.animation = 'fadeInUp 0.5s ease-out forwards';
                
                // Insert at the beginning of the grid (since products are ORDER BY id DESC)
                if (grid.firstChild) {
                    grid.insertBefore(newCard, grid.firstChild);
                } else {
                    grid.appendChild(newCard);
                }
            }
        });
    }

    // Update state and cache
    productData = newProducts;
    try {
        localStorage.setItem(CACHE_KEY_PRODUCTS, newJson);
    } catch (e) {}

    // Update category filter buttons if new categories appeared
    renderCategoryFilters();
}

function filterProducts(type) {
    currentFilter = type;
    try {
        localStorage.setItem(CACHE_KEY_FILTER, type);
    } catch (e) {}

    // Update active class on filter buttons
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        const btnText = btn.innerText.trim();
        if (btnText.toLowerCase() === type.toLowerCase() || (btnText === 'ALL' && type === 'ALL')) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    renderProducts();
}

function renderCategoryFilters() {
    const filterContainer = document.querySelector('.product-filter');
    if (!filterContainer || productData.length === 0) return;

    // Distinct categories/types from product data
    const types = Array.from(new Set(productData.map(p => (p.type || p.category_name || '').trim()).filter(Boolean)));
    
    let html = `<button class="filter-btn ${currentFilter === 'ALL' ? 'active' : ''}" onclick="filterProducts('ALL')">ALL</button>`;
    types.forEach(t => {
        const isActive = currentFilter.toLowerCase() === t.toLowerCase() ? 'active' : '';
        html += `<button class="filter-btn ${isActive}" onclick="filterProducts('${t}')">${t}</button>`;
    });

    filterContainer.innerHTML = html;
}

// Render function to generate HTML for the whole grid
function renderProducts() {
    renderCategoryFilters();
    const grid = document.querySelector('.product-grid');
    if (!grid) return;

    // If data not loaded yet, fetch from API and display loading state
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

    const filteredData = currentFilter === 'ALL'
        ? productData
        : productData.filter(p => {
            const pType = (p.type || p.category_name || '').toLowerCase();
            return pType === currentFilter.toLowerCase();
        });

    if (filteredData.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                <p style="font-size: 18px; font-weight: 600; color: #94a3b8;">No products found in "${currentFilter}".</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredData.map(product => renderSingleProductCard(product)).join('');
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
