const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('✅ MongoDB connected');
    seedDatabase();
  })
  .catch(err => console.error('MongoDB error:', err));

// ======================== SCHEMAS ========================
const orderItemSchema = new mongoose.Schema({
    id: String, name: String, price: Number, quantity: Number
});
const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [orderItemSchema],
    total: Number,
    paymentMethod: String,
    paymentId: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rollNumber: { type: String, default: 'Not Set' },
    canteenId: { type: String, unique: true, sparse: true },
    profileImage: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: 'Greater Noida, Noida' },
    prefPayment: { type: String, default: 'UPI' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    lastLogin: Date,
    createdAt: { type: Date, default: Date.now }
});
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    orderId: String,
    amount: Number,
    type: { type: String, enum: ['purchase', 'refund'], default: 'purchase' },
    paymentId: String,
    createdAt: { type: Date, default: Date.now }
});
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    weight: String,
    image: String,
    popularity: { type: Number, default: 0 },
    category: String,
    stock: { type: Number, default: 20 }, // Added stock field
    inStock: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const supportTicketSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subject: { type: String, required: true },
    orderId: { type: String, default: '' },
    message: { type: String, required: true },
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Order = mongoose.model('Order', orderSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

// Admin Seeding
async function seedAdmin() {
    try {
        const email = 'DA@gmail.com';
        const existing = await User.findOne({ email });
        if (!existing) {
            const hashedPassword = await bcrypt.hash('DjAk1403@', 10);
            await User.create({
                name: 'DronaTeen Admin',
                email: email,
                password: hashedPassword,
                role: 'admin',
                canteenId: 'ADMIN01'
            });
            console.log('✅ Admin user seeded: DA@gmail.com');
        } else if (existing.role !== 'admin') {
            existing.role = 'admin';
            await existing.save();
            console.log('✅ User promoted to Admin');
        }
    } catch (err) { console.error('Admin seeding failed:', err); }
}
seedAdmin();
const Product = mongoose.model('Product', productSchema);

// ======================== EMAIL ========================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
async function sendAdminAlert(action, user, req, extra = {}) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const html = `<h3>🔔 DronTeen Alert: ${action}</h3><p><strong>User:</strong> ${user.name} (${user.email})</p><p><strong>Time:</strong> ${new Date().toLocaleString()}</p><p><strong>IP:</strong> ${ip}</p><p><strong>Device:</strong> ${userAgent}</p>${extra.orderAmount ? `<p><strong>Order Amount:</strong> ₹${extra.orderAmount}</p>` : ''}`;
    try {
        await transporter.sendMail({ from: process.env.EMAIL_USER, to: adminEmail, subject: `[DronTeen] ${action}`, html });
    } catch (err) { console.error('Email error:', err.message); }
}

// ======================== AUTH MIDDLEWARE ========================
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
};
const adminMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
        req.userId = decoded.userId;
        next();
    } catch (err) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
};

// ======================== PUBLIC AUTH ROUTES ========================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, address, prefPayment } = req.body;
        if (await User.findOne({ email })) return res.status(400).json({ success: false, message: 'Email exists' });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashed, address, prefPayment, role: 'user' });
        await user.save();
        const token = jwt.sign({ userId: user._id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        sendAdminAlert('New User Registration', user, req);
        res.json({ success: true, token, user: { name, email, role: user.role } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        user.lastLogin = new Date();
        await user.save();
        const token = jwt.sign({ userId: user._id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        sendAdminAlert('User Login', user, req);
        res.json({ success: true, token, user: { name: user.name, email: user.email, role: user.role } });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ======================== USER ROUTES (existing) ========================
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    const user = await User.findById(req.userId).select('-password');
    res.json({ success: true, user });
});
app.put('/api/user/profile', authMiddleware, async (req, res) => {
    const body = req.body;
    const allowedUpdates = ['name', 'email', 'address', 'phone', 'prefPayment', 'rollNumber', 'canteenId', 'profileImage'];
    const updates = {};
    
    allowedUpdates.forEach(key => {
        if (body[key] !== undefined) updates[key] = body[key];
    });

    if (body.password?.trim()) updates.password = await bcrypt.hash(body.password, 10);
    
    try {
        const user = await User.findById(req.userId);
        
        // Prevent changing Roll Number if already set (not 'Not Set')
        if (updates.rollNumber && user.rollNumber && user.rollNumber !== 'Not Set' && user.rollNumber !== updates.rollNumber) {
            delete updates.rollNumber;
        }
        // Prevent changing Canteen ID if already set
        if (updates.canteenId && user.canteenId && user.canteenId !== updates.canteenId) {
            delete updates.canteenId;
        }

        const updatedUser = await User.findByIdAndUpdate(req.userId, updates, { new: true }).select('-password');
        sendAdminAlert('Profile Updated', updatedUser, req);
        res.json({ success: true, user: updatedUser });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, message: 'Canteen ID already exists' });
        res.status(500).json({ success: false, message: err.message });
    }
});
app.get('/api/user/orders', authMiddleware, async (req, res) => {
    const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, orders });
});
app.get('/api/user/transactions', authMiddleware, async (req, res) => {
    const transactions = await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, transactions });
});
app.post('/api/orders', authMiddleware, async (req, res) => {
    try {
        const { items, total, paymentMethod, paymentId } = req.body;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // 1. Validate Stock
        for (const item of items) {
            const product = await Product.findById(item.id);
            if (!product) return res.status(404).json({ success: false, message: `Product ${item.name} not found` });
            if (product.stock < item.quantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Insufficient stock for ${item.name}. Only ${product.stock} pieces left.` 
                });
            }
        }

        // 2. Decrement Stock
        for (const item of items) {
            await Product.findByIdAndUpdate(item.id, { $inc: { stock: -item.quantity } });
        }

        const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const order = new Order({ orderId, userId: req.userId, items, total, paymentMethod, paymentId, status: 'confirmed' });
        await order.save();
        
        await new Transaction({ userId: req.userId, orderId, amount: total, type: 'purchase', paymentId }).save();
        sendAdminAlert('New Order Placed', user, req, { orderAmount: total });
        
        res.status(201).json({ success: true, orderId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Support Tickets (User)
app.post('/api/support', authMiddleware, async (req, res) => {
    try {
        const { subject, orderId, message } = req.body;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        const ticket = new SupportTicket({ userId: req.userId, subject, orderId, message });
        await ticket.save();
        
        sendAdminAlert('New Support Ticket', user, req, { message: `Subject: ${subject}<br>Order ID: ${orderId || 'N/A'}<br>Message: ${message}` });
        
        res.status(201).json({ success: true, ticket });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
app.get('/api/support', authMiddleware, async (req, res) => {
    try {
        const tickets = await SupportTicket.find({ userId: req.userId }).sort({ createdAt: -1 });
        res.json({ success: true, tickets });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ======================== ADMIN ROUTES ========================
// Get all users
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    const users = await User.find().select('-password');
    res.json({ success: true, users });
});
// Update user role (make admin)
app.put('/api/admin/users/:id', adminMiddleware, async (req, res) => {
    const { role } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    res.json({ success: true, user });
});
// Get single user details with orders
app.get('/api/admin/users/:id', adminMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        const orders = await Order.find({ userId: req.params.id }).sort({ createdAt: -1 });
        res.json({ success: true, user, orders });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
// Delete user
app.delete('/api/admin/users/:id', adminMiddleware, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// Orders management
app.get('/api/admin/orders', adminMiddleware, async (req, res) => {
    const orders = await Order.find().populate('userId', 'name email').sort({ createdAt: -1 });
    res.json({ success: true, orders });
});
app.put('/api/admin/orders/:orderId', adminMiddleware, async (req, res) => {
    const { status } = req.body;
    const order = await Order.findOneAndUpdate({ orderId: req.params.orderId }, { status }, { new: true });
    res.json({ success: true, order });
});
app.delete('/api/admin/orders/:orderId', adminMiddleware, async (req, res) => {
    await Order.findOneAndDelete({ orderId: req.params.orderId });
    res.json({ success: true });
});

// Products CRUD
app.get('/api/products', async (req, res) => {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json({ success: true, products });
});
app.post('/api/admin/products', adminMiddleware, async (req, res) => {
    const product = new Product(req.body);
    await product.save();
    res.json({ success: true, product });
});
app.put('/api/admin/products/:id', adminMiddleware, async (req, res) => {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, product });
});
app.delete('/api/admin/products/:id', adminMiddleware, async (req, res) => {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// Support Tickets Management
app.get('/api/admin/support', adminMiddleware, async (req, res) => {
    try {
        const tickets = await SupportTicket.find().populate('userId', 'name email phone').sort({ createdAt: -1 });
        res.json({ success: true, tickets });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
app.put('/api/admin/support/:id', adminMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.json({ success: true, ticket });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/admin/seed', adminMiddleware, async (req, res) => {
    try {
        await seedDatabase();
        res.json({ success: true, message: 'Database seeded manually' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Dashboard stats
app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([{ $group: { _id: null, total: { $sum: "$total" } } }]);
    const totalProducts = await Product.countDocuments();
    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5);
    res.json({ success: true, stats: { totalUsers, totalOrders, totalRevenue: totalRevenue[0]?.total || 0, totalProducts }, recentOrders });
});

// Seeding Logic
async function seedDatabase() {
    // 1. Seed Admin
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
        const hashed = await bcrypt.hash('DjAk1403@', 10);
        await User.create({ 
            name: 'Amit Kumar', 
            email: 'DA@gmail.com', 
            password: hashed, 
            role: 'admin', 
            address: 'Admin Office',
            phone: '9999999999'
        });
        console.log('✅ Admin account seeded: DA@gmail.com');
    }

    // 2. Seed Default Products
    const productCount = await Product.countDocuments();
    if (productCount < 5) {
        const defaultProducts = [
            { name: "Chole Bhature", price: 120, weight: "2 Bhature + Chole", image: "https://madhurasrecipe.com/wp-content/uploads/2025/09/MR-Chole-Bhature-featured.jpg", popularity: 8, category: 'Breakfast', stock: 15 },
            { name: "Samosa", price: 40, weight: "1 piece", image: "https://recipes.timesofindia.com/thumb/61050397.cms?width=1200&height=900", popularity: 10, category: 'Snacks', stock: 50 },
            { name: "Veg Puff", price: 25, weight: "1 piece", image: "https://www.elloras.in/cdn/shop/products/Mushroom-Puff_693x.jpg?v=1660911957", popularity: 9, category: 'Snacks', stock: 30 },
            { name: "Hot Coffee", price: 30, weight: "1 cup", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTa0tizr4Mp3AZDTp-nJLGAp5QQsQhC2u0PNw&s", popularity: 7, category: 'Beverages', stock: 100 },
            { name: "Chole Kulche", price: 80, weight: "2 kulche + chole", image: "https://media-assets.swiggy.com/swiggy/image/upload/f_auto,q_auto,fl_lossy/pdwsoobxs6wzul1jqljr", popularity: 7, category: 'Lunch', stock: 20 },
            { name: "Aloo Paratha", price: 60, weight: "2 pieces", image: "https://www.indianhealthyrecipes.com/wp-content/uploads/2020/08/aloo-paratha-recipe-500x500.jpg", popularity: 6, category: 'Breakfast', stock: 10 },
            { name: "Coca-Cola 1L", price: 20, weight: "1 litre", image: "https://www.coca-cola.com/content/dam/onexp/us/en/brands/coca-cola-spiced/coke-product-category-card.png", popularity: 5, category: 'Beverages', stock: 40 },
            { name: "Dairy Milk", price: 35, weight: "45g", image: "https://m.media-amazon.com/images/I/718ecxjECuL.jpg", popularity: 6, category: 'Snacks', stock: 25 }
        ];
        // Only insert if they don't already exist by name
        for (const p of defaultProducts) {
            const exists = await Product.findOne({ name: p.name });
            if (!exists) await Product.create(p);
        }
        console.log('✅ Default products verified and seeded if missing');
    }
}
// seedDatabase(); // Called inside mongoose.connect

app.get('/api/health', (req, res) => res.json({ success: true, message: 'Server running' }));
app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));