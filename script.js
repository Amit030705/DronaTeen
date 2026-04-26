
// Check authentication
function checkAuth() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (!isLoggedIn) {
        window.location.href = 'login.html';
    }
}

// Handle logout
function handleLogout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', function () {
    // Check authentication first
    checkAuth();

    // Update login button to show user email and logout option
    const userMenuBtn = document.querySelector('.login-btn');
    const userEmail = localStorage.getItem('userEmail');
    if (userMenuBtn && userEmail) {
        userMenuBtn.innerHTML = `
            <i class="fas fa-user"></i>
            <span>${userEmail}</span>
        `;
        userMenuBtn.addEventListener('click', handleLogout);
    }
    // Products data
    let products = [
        { id: "1", name: "CholeBhature", price: 120, weight: "2 Bhature and chole", image: "https://madhurasrecipe.com/wp-content/uploads/2025/09/MR-Chole-Bhature-featured.jpg", popularity: 8 },
        { id: "2", name: "Samosa", price: 40, weight: "1 piece", image: "https://recipes.timesofindia.com/thumb/61050397.cms?width=1200&height=900", popularity: 10 },
        { id: "3", name: "Patties", price: 25, weight: "1 piece", image: "https://www.elloras.in/cdn/shop/products/Mushroom-Puff_693x.jpg?v=1660911957%201x,//www.elloras.in/cdn/shop/products/Mushroom-Puff_693x@2x.jpg?v=1660911957%202x", popularity: 9 },
        { id: "4", name: "Coffee", price: 30, weight: "1 piece", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTa0tizr4Mp3AZDTp-nJLGAp5QQsQhC2u0PNw&s", popularity: 7 },
        { id: "5", name: "CholeKulche", price: 80, weight: "2 kulche and chole", image: "https://media-assets.swiggy.com/swiggy/image/upload/f_auto,q_auto,fl_lossy/pdwsoobxs6wzul1jqljr", popularity: 7 },
        { id: "6", name: "AlooParantha", price: 60, weight: "2 paranthe", image: "https://www.indianhealthyrecipes.com/wp-content/uploads/2020/08/aloo-paratha-recipe-500x500.jpg", popularity: 6 },
        { id: "7", name: "CocaCola", price: 20, weight: "1 litre", image: "https://www.coca-cola.com/content/dam/onexp/us/en/brands/coca-cola-spiced/coke-product-category-card.png", popularity: 5 },
        { id: "8", name: "Chocolate", price: 35, weight: "1 piece", image: "https://m.media-amazon.com/images/I/718ecxjECuL.jpg", popularity: 6 }
    ];

    // Cart data
    let cart = [];
    const productsGrid = document.getElementById('products-grid');
    const sortSelect = document.getElementById('sort-products');
    const cartItems = document.getElementById('cart-items');
    const cartCount = document.getElementById('cart-count');
    const itemTotal = document.getElementById('item-total');
    const cartTotal = document.getElementById('cart-total');
    const checkoutBtn = document.getElementById('checkout-btn');
    const paymentModal = document.getElementById('payment-modal');
    const receiptModal = document.getElementById('receipt-modal');
    const closeModal = document.querySelector('.close-modal');
    const closeReceipt = document.querySelector('.close-receipt');
    const payBtn = document.getElementById('pay-btn');
    const printBtn = document.getElementById('print-btn');
    const receiptContent = document.getElementById('receipt-content');
    const upiIdInput = document.getElementById('upi-id');
    const loginBtn = document.querySelector('.login-btn');
    const loginModal = document.getElementById('login-modal');
    const closeLogin = document.querySelector('.close-login');
    const loginForm = document.getElementById('login-form');
    const RAZORPAY_KEY_ID = "rzp_test_RP4iA95YzW2bj1";

    let currentUser = null;

    // Render products
    function renderProducts(productList) {
        productsGrid.innerHTML = '';
        productList.forEach(prod => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <div class="product-image">
                    <img src="${prod.image}" alt="${prod.name}">
                </div>
                <div class="product-info">
                    <div class="product-name">${prod.name}</div>
                    <div class="product-weight">${prod.weight}</div>
                    <div class="product-price">₹${prod.price}</div>
                    <div class="product-actions">
                        <button class="add-to-cart" data-id="${prod.id}" data-name="${prod.name}" data-price="${prod.price}">Add to Cart</button>
                    </div>
                </div>
            `;
            productsGrid.appendChild(card);
        });

        document.querySelectorAll('.add-to-cart').forEach(button => {
            button.addEventListener('click', function () {
                const id = this.dataset.id;
                const name = this.dataset.name;
                const price = parseInt(this.dataset.price);
                const existingItem = cart.find(item => item.id === id);

                if (existingItem) {
                    existingItem.quantity += 1;
                } else {
                    cart.push({ id, name, price, quantity: 1 });
                }
                updateCart();
            });
        });
    }

    function sortProductsAndRender() {
        let sorted = [...products];
        const val = sortSelect.value;
        if (val === 'price-low-high') {
            sorted.sort((a, b) => a.price - b.price);
        } else if (val === 'price-high-low') {
            sorted.sort((a, b) => b.price - a.price);
        } else {
            sorted.sort((a, b) => b.popularity - a.popularity);
        }
        renderProducts(sorted);
    }
    sortSelect.addEventListener('change', sortProductsAndRender);

    function updateCart() {
        cartItems.innerHTML = '';
        if (cart.length === 0) {
            cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Your cart is empty</p>
                </div>
            `;
            checkoutBtn.disabled = true;
            checkoutBtn.style.opacity = "0.7";
        } else {
            checkoutBtn.disabled = false;
            checkoutBtn.style.opacity = "1";
            cart.forEach(item => {
                const cartItem = document.createElement('div');
                cartItem.className = 'cart-item';
                cartItem.innerHTML = `
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">₹${item.price}</div>
                    </div>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn minus" data-id="${item.id}">-</button>
                        <span class="quantity-value">${item.quantity}</span>
                        <button class="quantity-btn plus" data-id="${item.id}">+</button>
                    </div>
                `;
                cartItems.appendChild(cartItem);
            });

            document.querySelectorAll('.quantity-btn.plus').forEach(btn => {
                btn.addEventListener('click', function () {
                    const id = this.dataset.id;
                    const item = cart.find(item => item.id === id);
                    item.quantity += 1;
                    updateCart();
                });
            });
            document.querySelectorAll('.quantity-btn.minus').forEach(btn => {
                btn.addEventListener('click', function () {
                    const id = this.dataset.id;
                    const item = cart.find(item => item.id === id);
                    item.quantity -= 1;
                    if (item.quantity === 0) {
                        cart = cart.filter(i => i.id !== id);
                    }
                    updateCart();
                });
            });
        }
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        const totalValue = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
        cartCount.textContent = `(${totalItems} ${totalItems === 1 ? 'item' : 'items'})`;
        itemTotal.textContent = `₹${totalValue}`;
        cartTotal.textContent = `₹${totalValue + 25 + 2}`;
    }

    checkoutBtn.addEventListener('click', function () {
        if (cart.length > 0) {
            paymentModal.style.display = 'flex';
        }
    });
    closeModal.addEventListener('click', function () {
        paymentModal.style.display = 'none';
    });
    closeReceipt.addEventListener('click', function () {
        receiptModal.style.display = 'none';
    });
    printBtn.addEventListener('click', function () {
        window.print();
    });
    document.querySelectorAll('input[name="payment"]').forEach(radio => {
        radio.addEventListener('change', function () {
            if (this.value === 'upi') {
                upiIdInput.style.display = 'inline-block';
            } else {
                upiIdInput.style.display = 'none';
            }
        });
    });
    payBtn.addEventListener('click', function () {
        const selectedPayment = document.querySelector('input[name="payment"]:checked').value;
        const upiId = upiIdInput.value;
        if (selectedPayment === 'cod') {
            generateReceipt();
            paymentModal.style.display = 'none';
            receiptModal.style.display = 'flex';
            saveOrderToDatabase(null, selectedPayment, upiId);
        } else if (selectedPayment === 'upi' && !upiId) {
            alert('Please enter your UPI ID');
            return;
        } else {
            initiateRazorpayPayment(selectedPayment, upiId);
        }
    });

    function initiateRazorpayPayment(paymentMethod, upiId) {
        const totalValue = cart.reduce((total, item) => total + (item.price * item.quantity), 0) + 25 + 2;
        const options = {
            key: RAZORPAY_KEY_ID,
            amount: totalValue * 100,
            currency: "INR",
            name: "DronTeen",
            description: "Grocery Purchase",
            image: "https://via.placeholder.com/50x50?text=D",
            handler: function (response) {
                generateReceipt(response.razorpay_payment_id, paymentMethod, upiId);
                paymentModal.style.display = 'none';
                receiptModal.style.display = 'flex';
                saveOrderToDatabase(response.razorpay_payment_id, paymentMethod, upiId);
            },
            prefill: {
                name: currentUser ? currentUser.email : "Customer",
                email: currentUser ? currentUser.email : "customer@example.com",
                contact: "9999999999"
            },
            notes: {
                address: "Customer Address"
            },
            theme: { color: "#0c831f" }
        };
        const rzp = new Razorpay(options);
        rzp.open();
        rzp.on('payment.failed', function (response) {
            alert(`Payment failed: ${response.error.description}`);
        });
    }

    function generateReceipt(paymentId = null, paymentMethod = 'cod', upiId = null) {
        const totalValue = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
        const totalAmount = totalValue + 25 + 2;
        const now = new Date();

        let receiptHTML = `
            <div class="receipt-header">
                <h3>DronTeen</h3>
                <p>Order Receipt</p>
            </div>
            <div class="receipt-details">
                <p><strong>Order ID:</strong> ${Math.floor(100000 + Math.random() * 900000)}</p>
                <p><strong>Date:</strong> ${now.toLocaleDateString()}</p>
                <p><strong>Time:</strong> ${now.toLocaleTimeString()}</p>
        `;

        if (paymentId) {
            receiptHTML += `<p><strong>Payment ID:</strong> ${paymentId}</p>`;
        }
        receiptHTML += `<p><strong>Payment Method:</strong> ${paymentMethod.toUpperCase()}`;
        if (paymentMethod === 'upi' && upiId) {
            receiptHTML += ` (${upiId})`;
        }
        receiptHTML += `</p></div><div class="receipt-items"><h4>Items Purchased:</h4>`;
        cart.forEach(item => {
            receiptHTML += `
                <div class="receipt-item">
                    <span>${item.name} x${item.quantity}</span>
                    <span>₹${item.price * item.quantity}</span>
                </div>
            `;
        });
        receiptHTML += `
            </div>
            <div class="receipt-summary">
                <div class="receipt-summary-row">
                    <span>Subtotal:</span>
                    <span>₹${totalValue}</span>
                </div>
                <div class="receipt-summary-row">
                    <span>Delivery Fee:</span>
                    <span>₹25</span>
                </div>
                <div class="receipt-summary-row">
                    <span>Platform Fee:</span>
                    <span>₹2</span>
                </div>
                <div class="receipt-summary-row receipt-total">
                    <span>Total:</span>
                    <span>₹${totalAmount}</span>
                </div>
            </div>
            <p style="text-align: center; margin-top: 20px; font-style: italic;">
                Thank you for your purchase! Present this receipt at the canteen to collect your items.
            </p>
        `;
        receiptContent.innerHTML = receiptHTML;
    }

    function saveOrderToDatabase(paymentId, paymentMethod, upiId) {
        const orderData = {
            items: cart,
            total: cart.reduce((total, item) => total + (item.price * item.quantity), 0) + 25 + 2,
            paymentId: paymentId,
            paymentMethod: paymentMethod,
            upiId: upiId,
            customerName: currentUser ? currentUser.email : "Customer",
            customerEmail: currentUser ? currentUser.email : "customer@example.com",
            date: new Date()
        };
        fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        })
            .then(response => response.json())
            .then(data => {
                cart = [];
                updateCart();
            })
            .catch(error => {
                alert('There was an error saving your order.');
            });
    }

    // LOGIN FUNCTIONALITY
    loginBtn.addEventListener('click', () => {
        loginModal.style.display = 'flex';
    });
    closeLogin.addEventListener('click', () => {
        loginModal.style.display = 'none';
    });
    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        if (email && password) {
            currentUser = { email: email };
            loginModal.style.display = 'none';
            loginBtn.querySelector('span').textContent = email.split('@')[0];
            loginBtn.querySelector('i').classList.remove('fa-user');
            loginBtn.querySelector('i').classList.add('fa-user-check');
            alert('Login successful!');
        } else {
            alert('Please enter valid credentials');
        }
    });
    window.addEventListener('click', function (event) {
        if (event.target === loginModal) loginModal.style.display = 'none';
        if (event.target === paymentModal) paymentModal.style.display = 'none';
        if (event.target === receiptModal) receiptModal.style.display = 'none';
    });

    // Initial display
    sortProductsAndRender();
    updateCart();
});
