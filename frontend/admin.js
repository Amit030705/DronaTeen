let token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/admin-login.html';

let currentProductId = null;

async function fetchAPI(endpoint, options = {}) {
    const res = await fetch(endpoint, {
        ...options,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options.headers }
    });
    if (res.status === 401) { localStorage.removeItem('adminToken'); window.location.href = '/admin-login.html'; }
    return res.json();
}

function showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.background = isError ? '#ef4444' : '#1e293b';
    toast.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showConfirm(title, text, okText = 'Delete') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmTitle').innerText = title;
        document.getElementById('confirmText').innerText = text;
        const okBtn = document.getElementById('okConfirmBtn');
        okBtn.innerText = okText;
        modal.style.display = 'flex';
        
        const cleanup = (res) => {
            modal.style.display = 'none';
            okBtn.onclick = null;
            document.getElementById('cancelConfirmBtn').onclick = null;
            resolve(res);
        };
        
        okBtn.onclick = () => cleanup(true);
        document.getElementById('cancelConfirmBtn').onclick = () => cleanup(false);
    });
}

// Load dashboard stats
async function loadDashboard() {
    const data = await fetchAPI('/api/admin/stats');
    if (data.success) {
        const stats = data.stats;
        document.getElementById('statsGrid').innerHTML = `
            <div class="stat-card"><div class="stat-title">Total Users</div><div class="stat-value">${stats.totalUsers}</div></div>
            <div class="stat-card"><div class="stat-title">Total Orders</div><div class="stat-value">${stats.totalOrders}</div></div>
            <div class="stat-card"><div class="stat-title">Revenue (₹)</div><div class="stat-value">₹${stats.totalRevenue}</div></div>
            <div class="stat-card"><div class="stat-title">Products</div><div class="stat-value">${stats.totalProducts}</div></div>
        `;
        let ordersHtml = '<table><tr><th>Order ID</th><th>User</th><th>Total</th><th>Status</th><th>Date</th></tr>';
        data.recentOrders.forEach(o => {
            ordersHtml += `<tr><td>${o.orderId}</td><td>${o.userId?.name || 'N/A'}</td><td>₹${o.total}</td><td><span class="status-badge status-${o.status}">${o.status}</span></td><td>${new Date(o.createdAt).toLocaleDateString()}</td></tr>`;
        });
        ordersHtml += ';</table>';
        document.getElementById('recentOrdersTable').innerHTML = ordersHtml;
        // Chart
        const revenueData = data.recentOrders.map(o => o.total);
        new Chart(document.getElementById('revenueChart'), { type: 'line', data: { labels: data.recentOrders.map(o => o.orderId), datasets: [{ label: 'Order Amount', data: revenueData, borderColor: '#0c831f' }] } });
    }
}

// Users
async function loadUsers() {
    const data = await fetchAPI('/api/admin/users');
    if (data.success) {
        let html = '<table><thead><tr><th>Name</th><th>Email</th><th>Canteen ID</th><th>Roll No</th><th>Role</th><th>Actions</th></tr></thead><tbody>';
        data.users.forEach(u => {
            html += `<tr><td>${u.name}</td><td>${u.email}</td><td><span class="canteen-badge">${u.canteenId || '-'}</span></td><td>${u.rollNumber || '-'}</td><td>${u.role}</td>
            <td>
                <button onclick="viewStudent('${u._id}')" title="View Profile"><i class="fas fa-eye"></i></button>
                <button onclick="toggleAdmin('${u._id}', '${u.role}')" title="Change Role"><i class="fas fa-user-shield"></i></button> 
                <button onclick="deleteUser('${u._id}')" title="Remove Student" style="background:#ef4444;"><i class="fas fa-trash"></i></button>
            </td></tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('usersTable').innerHTML = html;
    }
}
window.viewStudent = async (id) => {
    const data = await fetchAPI(`/api/admin/users/${id}`);
    if (data.success) {
        document.getElementById('studentModal').style.display = 'flex';
        document.getElementById('stDetailName').innerText = data.user.name;
        document.getElementById('stDetailEmail').innerText = data.user.email;
        document.getElementById('stDetailRoll').innerText = data.user.rollNumber || 'Not Set';
        document.getElementById('stDetailCanteen').innerText = data.user.canteenId || 'Not Set';
        document.getElementById('stDetailImg').src = data.user.profileImage || 'https://via.placeholder.com/150';
        
        // Hide Roll No for admins
        document.getElementById('stDetailRollGroup').style.display = data.user.role === 'admin' ? 'none' : 'block';
        
        const roleBadge = document.getElementById('stDetailRoleBadge');
        const roleBtn = document.getElementById('stChangeRoleBtn');
        roleBadge.innerText = data.user.role.toUpperCase();
        roleBadge.className = `status-badge ${data.user.role === 'admin' ? 'status-confirmed' : 'status-pending'}`;
        roleBtn.innerText = data.user.role === 'admin' ? 'Revoke Admin' : 'Make Admin';
        roleBtn.onclick = async () => {
            const newRole = data.user.role === 'admin' ? 'user' : 'admin';
            const ok = await showConfirm('Change Role', `Change ${data.user.name}'s role to ${newRole}?`, 'Confirm Change');
            if(ok) {
                await fetchAPI(`/api/admin/users/${data.user._id}`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
                showToast('Role updated');
                viewStudent(data.user._id);
                loadUsers();
            }
        };

        let ordersHtml = '<table><thead><tr><th>Order ID</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>';
        data.orders.forEach(o => {
            ordersHtml += `<tr><td>${o.orderId}</td><td>${new Date(o.createdAt).toLocaleDateString()}</td><td>₹${o.total}</td><td><span class="status-badge status-${o.status}">${o.status}</span></td></tr>`;
        });
        document.getElementById('stDetailOrders').innerHTML = ordersHtml + '</tbody></table>';
    }
};
window.toggleAdmin = async (id, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await fetchAPI(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
    loadUsers();
};
window.deleteUser = async (id) => { 
    const ok = await showConfirm('Remove Student', 'Are you sure you want to remove this student? This will permanently delete their account and history.', 'Remove Permanently');
    if(ok){ 
        const res = await fetchAPI(`/api/admin/users/${id}`, { method: 'DELETE' }); 
        if(res.success) {
            showToast('Student removed successfully');
            loadUsers(); 
        }
    } 
};

// Orders
async function loadOrders() {
    const data = await fetchAPI('/api/admin/orders');
    if (data.success) {
        let html = '<table><tr><th>Order ID</th><th>User</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th><th>Actions</th></tr>';
        data.orders.forEach(o => {
            let items = o.items.map(i => `${i.name} x${i.quantity}`).join(', ');
            html += `<tr><td>${o.orderId}</td><td>${o.userId?.name || 'N/A'}</td><td>${items}</td><td>₹${o.total}</td>
            <td><select id="status-${o.orderId}" onchange="updateStatus('${o.orderId}', this.value)"><option ${o.status==='pending'?'selected':''}>pending</option><option ${o.status==='confirmed'?'selected':''}>confirmed</option><option ${o.status==='delivered'?'selected':''}>delivered</option></select></td>
            <td>${new Date(o.createdAt).toLocaleDateString()}</td>
            <td><button onclick="deleteOrder('${o.orderId}')">Delete</button></td></tr>`;
        });
        html += '</table>';
        document.getElementById('ordersTable').innerHTML = html;
    }
}
window.updateStatus = async (orderId, status) => {
    await fetchAPI(`/api/admin/orders/${orderId}`, { method: 'PUT', body: JSON.stringify({ status }) });
    loadOrders();
};
window.deleteOrder = async (orderId) => {
    const ok = await showConfirm('Cancel Order', `Delete order ${orderId}? This cannot be undone.`, 'Delete Order');
    if(ok){ await fetchAPI(`/api/admin/orders/${orderId}`, { method: 'DELETE' }); loadOrders(); showToast('Order deleted'); }
};

// Products
async function loadProducts() {
    const data = await fetchAPI('/api/products');
    if (data.success) {
        if (data.products.length === 0) {
            document.getElementById('productsTable').innerHTML = `
                <div style="text-align: center; padding: 50px; color: #64748b;">
                    <i class="fas fa-box-open" style="font-size: 48px; margin-bottom: 15px; opacity: 0.3;"></i>
                    <p style="font-weight: 600;">No products found</p>
                    <p style="font-size: 14px;">Add your first menu item using the button above.</p>
                </div>`;
            return;
        }
        let html = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Image</th>
                            <th>Product Details</th>
                            <th>Price</th>
                            <th>Weight</th>
                            <th>Stock</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        data.products.forEach(p => {
            html += `
                <tr>
                    <td>
                        <img src="${p.image || 'https://via.placeholder.com/60'}" 
                             style="width: 50px; height: 50px; border-radius: 12px; object-fit: cover; border: 1px solid #eee;">
                    </td>
                    <td>
                        <div style="font-weight: 700; color: #0f172a;">${p.name}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${p.category || 'General'}</div>
                    </td>
                    <td>
                        <div style="font-weight: 800; color: #0c831f;">₹${p.price}</div>
                    </td>
                    <td>
                        <span class="canteen-badge">${p.weight}</span>
                    </td>
                    <td>
                        <div style="font-weight: 700; color: ${p.stock <= 5 ? '#ef4444' : '#1e293b'}">${p.stock || 0}</div>
                    </td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="editProduct('${p._id}')" style="padding: 8px 12px; background: #f1f5f9; color: #475569; box-shadow: none;">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button onclick="deleteProduct('${p._id}')" style="padding: 8px 12px; background: #fee2e2; color: #dc2626; box-shadow: none;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        });
        
        html += '</tbody></table></div>';
        document.getElementById('productsTable').innerHTML = html;
    }
}
function editProduct(id) { 
    currentProductId = id;
    document.getElementById('modalTitle').innerText = 'Edit Product';
    document.getElementById('productModal').style.display = 'flex';
    // fetch product details
    fetchAPI('/api/products').then(data => {
        const prod = data.products.find(p => p._id === id);
        if(prod){
            document.getElementById('prodName').value = prod.name;
            document.getElementById('prodPrice').value = prod.price;
            document.getElementById('prodWeight').value = prod.weight;
            document.getElementById('prodImage').value = prod.image;
            document.getElementById('prodPopularity').value = prod.popularity;
            document.getElementById('prodCategory').value = prod.category || 'Lunch';
            document.getElementById('prodStock').value = prod.stock || 0;
        }
    });
}
window.deleteProduct = async (id) => { 
    const ok = await showConfirm('Delete Product', 'Remove this item from the menu?', 'Delete Item');
    if(ok){ await fetchAPI(`/api/admin/products/${id}`, { method: 'DELETE' }); loadProducts(); showToast('Product removed'); } 
};
document.getElementById('addProductBtn').onclick = () => { currentProductId = null; document.getElementById('modalTitle').innerText = 'Add Product'; document.getElementById('productModal').style.display = 'flex'; };
document.getElementById('saveProductBtn').onclick = async () => {
    const product = {
        name: document.getElementById('prodName').value,
        price: parseInt(document.getElementById('prodPrice').value),
        weight: document.getElementById('prodWeight').value,
        image: document.getElementById('prodImage').value,
        popularity: parseInt(document.getElementById('prodPopularity').value) || 0,
        stock: parseInt(document.getElementById('prodStock').value) || 0,
        category: document.getElementById('prodCategory').value
    };
    if(currentProductId){
        const res = await fetchAPI(`/api/admin/products/${currentProductId}`, { method: 'PUT', body: JSON.stringify(product) });
        if(res.success) {
            showToast('Product updated successfully');
            document.getElementById('productModal').style.display = 'none';
            loadProducts();
        }
    } else {
        const res = await fetchAPI('/api/admin/products', { method: 'POST', body: JSON.stringify(product) });
        if(res.success) {
            showToast('Product added successfully');
            document.getElementById('productModal').style.display = 'none';
            loadProducts();
        }
    }
    document.getElementById('productModal').style.display = 'none';
    loadProducts();
};
document.querySelectorAll('.close').forEach(btn => btn.onclick = () => document.getElementById('productModal').style.display = 'none');

// Tab navigation
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        const section = item.dataset.section;
        document.getElementById('dashboardSection').style.display = section === 'dashboard' ? 'block' : 'none';
        document.getElementById('usersSection').style.display = section === 'users' ? 'block' : 'none';
        document.getElementById('ordersSection').style.display = section === 'orders' ? 'block' : 'none';
        document.getElementById('productsSection').style.display = section === 'products' ? 'block' : 'none';
        document.getElementById('settingsSection').style.display = section === 'settings' ? 'block' : 'none';
        
        if(section === 'users') loadUsers();
        if(section === 'orders') loadOrders();
        if(section === 'products') loadProducts();
        if(section === 'dashboard') loadDashboard();
        if(section === 'settings') loadAdminSettings();
    });
});

async function loadAdminSettings() {
    const data = await fetchAPI('/api/user/profile');
    if (data.success) {
        document.getElementById('adminNameInput').value = data.user.name || '';
        document.getElementById('adminPhoneInput').value = data.user.phone || '';
        document.getElementById('adminAddressInput').value = data.user.address || '';
    }
}

document.getElementById('adminSettingsForm').onsubmit = async (e) => {
    e.preventDefault();
    const updates = {
        name: document.getElementById('adminNameInput').value,
        phone: document.getElementById('adminPhoneInput').value,
        address: document.getElementById('adminAddressInput').value
    };
    const res = await fetchAPI('/api/user/profile', { method: 'PUT', body: JSON.stringify(updates) });
    if (res.success) showToast('Admin settings updated');
};

// Global Modal Close logic
document.getElementById('closeStudentModal').onclick = () => { document.getElementById('studentModal').style.display = 'none'; };
document.querySelector('#productModal .close').onclick = () => { document.getElementById('productModal').style.display = 'none'; };

window.onclick = (event) => {
    const studentModal = document.getElementById('studentModal');
    const productModal = document.getElementById('productModal');
    const confirmModal = document.getElementById('confirmModal');
    if (event.target == studentModal) studentModal.style.display = 'none';
    if (event.target == productModal) productModal.style.display = 'none';
    if (event.target == confirmModal) confirmModal.style.display = 'none';
};

document.getElementById('logoutAdmin').addEventListener('click', () => { 
    localStorage.removeItem('adminToken'); 
    window.location.href = '/admin-login.html'; 
});

loadDashboard();