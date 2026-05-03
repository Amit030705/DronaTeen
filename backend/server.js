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
    walletUsed: { type: Number, default: 0 },
    payableAmount: { type: Number, default: 0 },
    paymentMethod: String,
    paymentId: String,
    status: { type: String, enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'], default: 'pending' },
    cancelReason: { type: String, default: '' },
    rating: { type: Number, min: 1, max: 5 },
    feedback: String,
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
    walletBalance: { type: Number, default: 0 },
    rewardPoints: { type: Number, default: 0 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    lastLogin: Date,
    createdAt: { type: Date, default: Date.now }
});
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    orderId: String,
    receiptNumber: String,
    amount: Number,
    type: { type: String, enum: ['purchase', 'refund', 'wallet_debit', 'wallet_credit', 'cashback'], default: 'purchase' },
    paymentId: String,
    createdAt: { type: Date, default: Date.now }
});
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
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
const makeReceiptNumber = (orderId = '') => `RCP-${orderId || Date.now()}-${Math.floor(Math.random() * 1000)}`;

const ORDER_STATUS_TRANSITIONS = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: []
};

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
app.get('/api/user/wallet', authMiddleware, async (req, res) => {
    const user = await User.findById(req.userId).select('walletBalance rewardPoints');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({
        success: true,
        wallet: {
            balance: Number(user.walletBalance || 0),
            rewardPoints: Number(user.rewardPoints || 0)
        }
    });
});
app.get('/api/user/spending/daily', authMiddleware, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const last7Start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

        const todayAgg = await Order.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.userId), createdAt: { $gte: todayStart, $lt: tomorrowStart }, status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);
        const yesterdayAgg = await Order.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.userId), createdAt: { $gte: yesterdayStart, $lt: todayStart }, status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);
        const dailyAgg = await Order.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.userId), createdAt: { $gte: last7Start, $lt: tomorrowStart }, status: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" }
                    },
                    total: { $sum: "$total" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
        ]);

        const today = todayAgg[0]?.total || 0;
        const yesterday = yesterdayAgg[0]?.total || 0;
        const difference = today - yesterday;
        const percentChange = yesterday === 0 ? (today > 0 ? 100 : 0) : Number(((difference / yesterday) * 100).toFixed(2));

        const daily = dailyAgg.map(d => ({
            date: `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`,
            total: d.total
        }));

        res.json({ success: true, spending: { today, yesterday, difference, percentChange, daily } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
app.put('/api/user/orders/:orderId/cancel', authMiddleware, async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await Order.findOne({ orderId: req.params.orderId, userId: req.userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const now = Date.now();
        const createdAtMs = new Date(order.createdAt).getTime();
        const twoMinutesMs = 2 * 60 * 1000;
        const withinCancelWindow = (now - createdAtMs) <= twoMinutesMs;

        if (order.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Order can no longer be cancelled by student' });
        }
        if (!withinCancelWindow) {
            return res.status(400).json({ success: false, message: '2-minute cancellation window has expired' });
        }

        // Restore stock on cancel
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.id, { $inc: { stock: item.quantity } });
        }

        order.status = 'cancelled';
        order.cancelReason = (reason || '').toString().trim().slice(0, 200);
        await order.save();

        const user = await User.findById(req.userId);
        if (user) {
            // Reverse cashback for this order if any was given earlier.
            const cashbackTxn = await Transaction.findOne({ userId: req.userId, orderId: order.orderId, type: 'cashback' });
            if (cashbackTxn && cashbackTxn.amount > 0) {
                user.walletBalance = Math.max(0, Number(user.walletBalance || 0) - Number(cashbackTxn.amount || 0));
                user.rewardPoints = Math.max(0, Number(user.rewardPoints || 0) - Number(cashbackTxn.amount || 0));
            }

            // Credit full order amount back to wallet as cancellation refund.
            user.walletBalance = Number(user.walletBalance || 0) + Number(order.total || 0);
            await user.save();
        }

        await new Transaction({
            userId: req.userId,
            orderId: order.orderId,
            receiptNumber: makeReceiptNumber(order.orderId),
            amount: order.total,
            type: 'wallet_credit',
            paymentId: order.paymentId || ''
        }).save();

        res.json({ success: true, message: 'Order cancelled successfully', order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
app.get('/api/user/transactions', authMiddleware, async (req, res) => {
    const transactions = await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, transactions });
});
app.get('/api/receipts/:receiptNumber/verify', async (req, res) => {
    try {
        const txn = await Transaction.findOne({ receiptNumber: req.params.receiptNumber }).populate('userId', 'name email');
        if (!txn) {
            return res.status(404).json({ success: false, valid: false, message: 'Receipt not found' });
        }
        res.json({
            success: true,
            valid: true,
            receipt: {
                receiptNumber: txn.receiptNumber,
                orderId: txn.orderId,
                amount: txn.amount,
                type: txn.type,
                paymentId: txn.paymentId,
                createdAt: txn.createdAt,
                user: txn.userId ? { name: txn.userId.name, email: txn.userId.email } : null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, valid: false, message: err.message });
    }
});
app.post('/api/orders', authMiddleware, async (req, res) => {
    try {
        const { items, total, paymentMethod, paymentId, walletUsed = 0 } = req.body;
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

        const requestedWalletUse = Math.max(0, Number(walletUsed) || 0);
        const applicableWalletUse = Math.min(requestedWalletUse, Number(user.walletBalance || 0), Number(total || 0));
        const payableAmount = Math.max(0, Number(total || 0) - applicableWalletUse);

        const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const order = new Order({
            orderId,
            userId: req.userId,
            items,
            total,
            walletUsed: applicableWalletUse,
            payableAmount,
            paymentMethod,
            paymentId,
            status: 'pending'
        });
        await order.save();

        if (applicableWalletUse > 0) {
            user.walletBalance = Math.max(0, Number(user.walletBalance || 0) - applicableWalletUse);
            await user.save();
            await new Transaction({
                userId: req.userId,
                orderId,
                receiptNumber: makeReceiptNumber(orderId),
                amount: applicableWalletUse,
                type: 'wallet_debit',
                paymentId: paymentId || ''
            }).save();
        }

        await new Transaction({
            userId: req.userId,
            orderId,
            receiptNumber: makeReceiptNumber(orderId),
            amount: payableAmount,
            type: 'purchase',
            paymentId
        }).save();

        // 2% cashback on paid amount (not on wallet-used amount)
        const cashback = Math.floor(payableAmount * 0.02);
        if (cashback > 0) {
            user.walletBalance = Number(user.walletBalance || 0) + cashback;
            user.rewardPoints = Number(user.rewardPoints || 0) + cashback;
            await user.save();
            await new Transaction({
                userId: req.userId,
                orderId,
                receiptNumber: makeReceiptNumber(orderId),
                amount: cashback,
                type: 'cashback',
                paymentId: paymentId || ''
            }).save();
        }
        sendAdminAlert('New Order Placed', user, req, { orderAmount: total });
        
        res.status(201).json({ success: true, orderId, _id: order._id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Order Rating
app.put('/api/orders/:id/rate', authMiddleware, async (req, res) => {
    try {
        const { rating, feedback } = req.body;
        const order = await Order.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { rating, feedback },
            { new: true }
        );
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, order });
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
        const transactions = await Transaction.find({ userId: req.params.id }).sort({ createdAt: -1 });
        res.json({ success: true, user, orders, transactions });
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
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const currentStatus = order.status;
    const nextAllowed = ORDER_STATUS_TRANSITIONS[currentStatus] || [];
    if (!nextAllowed.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `Invalid status transition from ${currentStatus} to ${status}`,
            allowedNext: nextAllowed
        });
    }

    order.status = status;
    await order.save();
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

// Daily earnings + day-over-day profit comparison
app.get('/api/admin/earnings/daily', adminMiddleware, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

        const todayAgg = await Order.aggregate([
            { $match: { createdAt: { $gte: todayStart, $lt: tomorrowStart }, status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);
        const yesterdayAgg = await Order.aggregate([
            { $match: { createdAt: { $gte: yesterdayStart, $lt: todayStart }, status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: "$total" } } }
        ]);

        const todayEarnings = todayAgg[0]?.total || 0;
        const yesterdayEarnings = yesterdayAgg[0]?.total || 0;
        const difference = todayEarnings - yesterdayEarnings;
        const percentChange = yesterdayEarnings === 0
            ? (todayEarnings > 0 ? 100 : 0)
            : Number((((difference) / yesterdayEarnings) * 100).toFixed(2));

        res.json({
            success: true,
            earnings: {
                today: todayEarnings,
                yesterday: yesterdayEarnings,
                difference,
                percentChange
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
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

// Chatbot integration (Gemini API)
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: 'Bot API key not configured.' });
        }

        const fetchParams = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `You are DronaTeen Assistant, a helpful and polite customer support bot for a college canteen delivery service called DronaTeen. Keep your answers brief, friendly, and helpful. Student message: ${message}` }] }]
            })
        };

        // Use dynamic import for node-fetch if Node < 18, or just rely on global fetch (Node 18+)
        // Assuming Node 18+ since it's a modern setup
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, fetchParams);
        const data = await response.json();

        if (data.candidates && data.candidates.length > 0) {
            const reply = data.candidates[0].content.parts[0].text;
            res.json({ success: true, reply });
        } else {
            console.error("Gemini API Error:", data);
            res.status(500).json({ success: false, message: 'Bot failed to understand.' });
        }
    } catch (err) {
        console.error("Chat API Exception:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/health', (req, res) => res.json({ success: true, message: 'Server running' }));
app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
