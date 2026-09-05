// main.js

// Function to slide images inside a specific product card
function moveSlide(button, direction) {
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
}

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
// DYNAMIC PRODUCT DATA (LOADED FROM BACKEND API)
// ============================================================
let productData = [];
let isFetchingProducts = false;
let currentFilter = 'ALL';

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
            productData = result.data;
        } else {
            console.warn('Could not load products from API:', result);
        }
    } catch (err) {
        console.error('Error connecting to products API:', err);
    } finally {
        isFetchingProducts = false;
        renderProducts();
    }
}

function filterProducts(type) {
    currentFilter = type;

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

// Render function to generate HTML
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

    grid.innerHTML = filteredData.map(product => {
        const images = (product.images && product.images.length > 0) 
            ? product.images 
            : ['img/IMG_3840.PNG'];

        const imagesHtml = images.map((img, index) => {
            const altText = index === 0 ? 'Front' : (index === 1 ? 'Back' : 'Side');
            const activeClass = index === 0 ? 'active' : '';
            const loadingAttr = index !== 0 ? 'loading="lazy"' : '';
            return `<img src="${img}" alt="${altText}" class="slide ${activeClass}" ${loadingAttr}>`;
        }).join('');

        const sliderButtons = images.length > 1 ? `
            <button class="slider-btn prev" onclick="moveSlide(this, -1)">&#10094;</button>
            <button class="slider-btn next" onclick="moveSlide(this, 1)">&#10095;</button>
        ` : '';

        const specs = Array.isArray(product.specs) ? product.specs : [];
        const specsHtml = specs.map(spec => `<p class="specs">${spec}</p>`).join('');

        const colors = Array.isArray(product.colors) ? product.colors : [];
        const colorName = product.colorName || product.color_name || `color_prod_${product.id}`;
        const cartName = (product.cartName || product.cart_name || product.name).replace(/'/g, "\\'");

        const colorsHtml = colors.map((c, index) => {
            const checked = index === 0 ? 'checked' : '';
            const borderStyle = c.border ? 'border: 1px solid #ddd;' : '';
            const colorVal = c.value || c.name || 'Default';
            const colorCode = c.colorCode || c.color || '#2c2c2c';
            return `
                <input type="radio" name="${colorName}" id="color_${colorVal}_${colorName}" value="${colorVal}" ${checked}>
                <label for="color_${colorVal}_${colorName}" class="color-swatch" style="background-color: ${colorCode}; ${borderStyle}"></label>
            `;
        }).join('');

        return `
        <div class="product-card">
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
    }).join('');
}

// Initialize rendering on page load & fetch products from backend
document.addEventListener('DOMContentLoaded', () => {
    fetchProductsFromAPI();
});
