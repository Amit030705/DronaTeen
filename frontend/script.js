// Check authentication - redirect to login if no token
if (!localStorage.getItem('droneToken')) window.location.href = '/login.html';

let products = [];

async function loadProductsFromAPI() {
    try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.success) {
            products = data.products.map(p => ({
                id: p._id,
                name: p.name,
                price: p.price,
                discountPercent: p.discountPercent || 0,
                finalPrice: Math.round((p.price || 0) * (1 - ((p.discountPercent || 0) / 100))),
                image: p.image,
                weight: p.weight,
                popularity: p.popularity || 5,
                category: p.category,
                stock: p.stock // Added stock
            }));
            sortProductsAndRender();
        }
    } catch (err) {
        console.error('Error loading products:', err);
    }
}
loadProductsFromAPI();

let cart = [];
const productsGrid = document.getElementById('products-grid');
const sortSelect = document.getElementById('sort-products');
const cartItems = document.getElementById('cart-items');
const cartCount = document.getElementById('cart-count');
const itemTotal = document.getElementById('item-total');
const cartTotal = document.getElementById('cart-total');
const checkoutBtn = document.getElementById('checkout-btn');
const RAZORPAY_KEY_ID = "rzp_test_RP4iA95YzW2bj1";

function renderProducts(productList) {
    productsGrid.innerHTML = '';
    productList.forEach(prod => {
        const isSoldOut = prod.stock <= 0;
        const isLowStock = prod.stock > 0 && prod.stock <= 5;

        const card = document.createElement('div');
        card.className = `product-card ${isSoldOut ? 'sold-out-card' : ''}`;
        card.style.position = 'relative';

        let stockHtml = '';
        if (isSoldOut) stockHtml = `<div class="stock-badge stock-out" style="position:absolute;top:10px;right:10px;background:#fee2e2;color:#dc2626;padding:4px 10px;border-radius:8px;font-size:0.75rem;font-weight:700;">Sold Out</div>`;
        else if (isLowStock) stockHtml = `<div class="stock-badge stock-low" style="position:absolute;top:10px;right:10px;background:#fff7ed;color:#9a3412;padding:4px 10px;border-radius:8px;font-size:0.75rem;font-weight:700;">Only ${prod.stock} left</div>`;

        let overlayHtml = isSoldOut ? `<div class="sold-out-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.6); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 900; color: #dc2626; text-transform: uppercase; letter-spacing: 2px; z-index: 10; backdrop-filter: blur(2px);">Sold Out</div>` : '';

        card.innerHTML = `
            ${stockHtml}
            <div class="product-image" style="position: relative;">
                ${overlayHtml}
                <img src="${prod.image}" alt="${prod.name}">
            </div>
            <div class="product-info">
                <div class="product-name">${prod.name}</div>
                <div class="product-weight">${prod.weight}</div>
                <div class="product-price">Rs ${prod.finalPrice}</div>
                ${prod.discountPercent > 0 ? `<div style="font-size: 12px; color: #64748b; margin-bottom: 10px;"><s>Rs ${prod.price}</s> - ${prod.discountPercent}% OFF</div>` : ''}
                <button class="add-to-cart" data-id="${prod.id}" data-name="${prod.name}" data-price="${prod.finalPrice}" ${isSoldOut ? 'disabled' : ''}>
                    ${isSoldOut ? 'Sold Out' : 'Add to Cart'}
                </button>
            </div>`;
        productsGrid.appendChild(card);
    });
    document.querySelectorAll('.add-to-cart').forEach(btn => btn.addEventListener('click', function() {
        const id = this.dataset.id, name = this.dataset.name, price = parseInt(this.dataset.price);
        const prod = products.find(p => p.id === id);
        const existing = cart.find(item => item.id === id);
        
        if (existing) {
            if (existing.quantity >= prod.stock) {
                alert(`Only ${prod.stock} pieces available`);
                return;
            }
            existing.quantity++;
        } else {
            cart.push({ id, name, price, quantity: 1 });
        }
        updateCart();
    }));
}

function sortProductsAndRender() {
    let sorted = [...products];
    const val = sortSelect.value;
    if (val === 'price-low-high') sorted.sort((a,b)=>a.price-b.price);
    else if (val === 'price-high-low') sorted.sort((a,b)=>b.price-a.price);
    else sorted.sort((a,b)=>b.popularity-a.popularity);
    renderProducts(sorted);
}
sortSelect.addEventListener('change', sortProductsAndRender);

function updateCart() {
    cartItems.innerHTML = cart.length === 0 ? `<div class="empty-cart"><i class="fas fa-shopping-cart"></i><p>Your cart is empty</p></div>` : '';
    cart.forEach(item => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `<div class="cart-item-info"><div class="cart-item-name">${item.name}</div><div class="cart-item-price">Rs ${item.price}</div></div><div class="cart-item-quantity"><button class="quantity-btn minus" data-id="${item.id}">-</button><span class="quantity-value">${item.quantity}</span><button class="quantity-btn plus" data-id="${item.id}">+</button></div>`;
        cartItems.appendChild(cartItem);
    });
    document.querySelectorAll('.quantity-btn.plus').forEach(btn => btn.addEventListener('click', function() { 
        const id = this.dataset.id; 
        const item = cart.find(i=>i.id===id);
        const prod = products.find(p=>p.id===id);
        if (item.quantity >= prod.stock) {
            alert(`Only ${prod.stock} pieces available`);
            return;
        }
        item.quantity++; 
        updateCart(); 
    }));
    document.querySelectorAll('.quantity-btn.minus').forEach(btn => btn.addEventListener('click', function() { const id = this.dataset.id; const item = cart.find(i=>i.id===id); item.quantity--; if(item.quantity===0) cart = cart.filter(i=>i.id!==id); updateCart(); }));
    const totalItems = cart.reduce((t,i)=>t+i.quantity,0);
    const totalValue = cart.reduce((t,i)=>t+i.price*i.quantity,0);
    cartCount.textContent = `(${totalItems} ${totalItems===1?'item':'items'})`;
    itemTotal.textContent = `Rs ${totalValue}`;
    cartTotal.textContent = `Rs ${totalValue+25+2}`;
    checkoutBtn.disabled = cart.length === 0;
}

async function saveOrderToDatabase(paymentId, paymentMethod, upiId) {
    const token = localStorage.getItem('droneToken');
    if (!token) { alert('Please login again'); window.location.href = '/login.html'; return; }
    const totalValue = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalAmount = totalValue + 25 + 2;
    const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ items: cart, total: totalAmount, paymentMethod, paymentId })
    });
    const data = await response.json();
    if (data.success) {
        alert('Order placed successfully!');
        cart = [];
        updateCart();
        window.location.href = '/dashboard.html';
    } else alert('Order failed: ' + data.message);
}

checkoutBtn.addEventListener('click', () => {
    if (cart.length === 0) return;
    const totalValue = cart.reduce((sum, item) => sum + item.price * item.quantity, 0) + 25 + 2;
    const options = {
        key: RAZORPAY_KEY_ID,
        amount: totalValue * 100,
        currency: "INR",
        name: "DronTeen",
        description: "Grocery Purchase",
        handler: function(response) { saveOrderToDatabase(response.razorpay_payment_id, 'card', null); },
        theme: { color: "#0c831f" }
    };
    const rzp = new Razorpay(options);
    rzp.open();
});

sortProductsAndRender();
updateCart();
