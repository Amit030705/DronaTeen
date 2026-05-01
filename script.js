// Check authentication – redirect to login if no token
if (!localStorage.getItem('droneToken')) window.location.href = '/login.html';

// Products data (same as before)
let products = [
    { id: "1", name: "CholeBhature", price: 120, weight: "2 Bhature and chole", image: "https://madhurasrecipe.com/wp-content/uploads/2025/09/MR-Chole-Bhature-featured.jpg", popularity: 8 },
    { id: "2", name: "Samosa", price: 40, weight: "1 piece", image: "https://recipes.timesofindia.com/thumb/61050397.cms?width=1200&height=900", popularity: 10 },
    { id: "3", name: "Patties", price: 25, weight: "1 piece", image: "https://www.elloras.in/cdn/shop/products/Mushroom-Puff_693x.jpg?v=1660911957", popularity: 9 },
    { id: "4", name: "Coffee", price: 30, weight: "1 piece", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTa0tizr4Mp3AZDTp-nJLGAp5QQsQhC2u0PNw&s", popularity: 7 },
    { id: "5", name: "CholeKulche", price: 80, weight: "2 kulche and chole", image: "https://media-assets.swiggy.com/swiggy/image/upload/f_auto,q_auto,fl_lossy/pdwsoobxs6wzul1jqljr", popularity: 7 },
    { id: "6", name: "AlooParantha", price: 60, weight: "2 paranthe", image: "https://www.indianhealthyrecipes.com/wp-content/uploads/2020/08/aloo-paratha-recipe-500x500.jpg", popularity: 6 },
    { id: "7", name: "CocaCola", price: 20, weight: "1 litre", image: "https://www.coca-cola.com/content/dam/onexp/us/en/brands/coca-cola-spiced/coke-product-category-card.png", popularity: 5 },
    { id: "8", name: "Chocolate", price: 35, weight: "1 piece", image: "https://m.media-amazon.com/images/I/718ecxjECuL.jpg", popularity: 6 }
];

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
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `<div class="product-image"><img src="${prod.image}" alt="${prod.name}"></div><div class="product-info"><div class="product-name">${prod.name}</div><div class="product-weight">${prod.weight}</div><div class="product-price">₹${prod.price}</div><button class="add-to-cart" data-id="${prod.id}" data-name="${prod.name}" data-price="${prod.price}">Add to Cart</button></div>`;
        productsGrid.appendChild(card);
    });
    document.querySelectorAll('.add-to-cart').forEach(btn => btn.addEventListener('click', function() {
        const id = this.dataset.id, name = this.dataset.name, price = parseInt(this.dataset.price);
        const existing = cart.find(item => item.id === id);
        existing ? existing.quantity++ : cart.push({ id, name, price, quantity: 1 });
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
        cartItem.innerHTML = `<div class="cart-item-info"><div class="cart-item-name">${item.name}</div><div class="cart-item-price">₹${item.price}</div></div><div class="cart-item-quantity"><button class="quantity-btn minus" data-id="${item.id}">-</button><span class="quantity-value">${item.quantity}</span><button class="quantity-btn plus" data-id="${item.id}">+</button></div>`;
        cartItems.appendChild(cartItem);
    });
    document.querySelectorAll('.quantity-btn.plus').forEach(btn => btn.addEventListener('click', function() { const id = this.dataset.id; cart.find(i=>i.id===id).quantity++; updateCart(); }));
    document.querySelectorAll('.quantity-btn.minus').forEach(btn => btn.addEventListener('click', function() { const id = this.dataset.id; const item = cart.find(i=>i.id===id); item.quantity--; if(item.quantity===0) cart = cart.filter(i=>i.id!==id); updateCart(); }));
    const totalItems = cart.reduce((t,i)=>t+i.quantity,0);
    const totalValue = cart.reduce((t,i)=>t+i.price*i.quantity,0);
    cartCount.textContent = `(${totalItems} ${totalItems===1?'item':'items'})`;
    itemTotal.textContent = `₹${totalValue}`;
    cartTotal.textContent = `₹${totalValue+25+2}`;
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