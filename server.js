const express = require('express');
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

// Security & middleware (CSP disabled for development)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // serve static files (HTML, CSS, JS)

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ------------------------ SCHEMAS ------------------------
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
    address: { type: String, default: 'Greater Noida, Noida' },
    prefPayment: { type: String, default: 'UPI' },
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

const User = mongoose.model('User', userSchema);
const Order = mongoose.model('Order', orderSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// ------------------------ EMAIL SETUP ------------------------
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
async function sendAdminAlert(action, user, req, extra = {}) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return console.warn('⚠️ ADMIN_EMAIL missing');
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const html = `<h3>🔔 DronTeen Alert: ${action}</h3><p><strong>User:</strong> ${user.name} (${user.email})</p><p><strong>Time:</strong> ${new Date().toLocaleString()}</p><p><strong>IP:</strong> ${ip}</p><p><strong>Device/Browser:</strong> ${userAgent}</p>${extra.orderAmount ? `<p><strong>Order Amount:</strong> ₹${extra.orderAmount}</p>` : ''}${extra.message ? `<p><strong>Details:</strong> ${extra.message}</p>` : ''}`;
    try {
        await transporter.sendMail({ from: process.env.EMAIL_USER, to: adminEmail, subject: `[DronTeen] ${action}`, html });
        console.log(`📧 Email sent: ${action}`);
    } catch (err) { console.error('Email failed:', err.message); }
}

// ------------------------ AUTH MIDDLEWARE ------------------------
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
};

// ------------------------ AUTH ROUTES ------------------------
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (await User.findOne({ email })) return res.status(400).json({ success: false, message: 'Email exists' });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashed });
        await user.save();
        const token = jwt.sign({ userId: user._id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        sendAdminAlert('New User Registration', user, req);
        res.json({ success: true, token, user: { name, email } });
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
        res.json({ success: true, token, user: { name: user.name, email: user.email, address: user.address, prefPayment: user.prefPayment } });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ------------------------ USER & DASHBOARD ROUTES ------------------------
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password');
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.put('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const { name, email, password, address, prefPayment } = req.body;
        const updates = { name, email, address, prefPayment };
        if (password?.trim()) updates.password = await bcrypt.hash(password, 10);
        const user = await User.findByIdAndUpdate(req.userId, updates, { new: true }).select('-password');
        sendAdminAlert('Profile Updated', user, req);
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.get('/api/user/orders', authMiddleware, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 });
        res.json({ success: true, orders });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.get('/api/user/transactions', authMiddleware, async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 });
        res.json({ success: true, transactions });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.post('/api/orders', authMiddleware, async (req, res) => {
    try {
        const { items, total, paymentMethod, paymentId } = req.body;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const order = new Order({ orderId, userId: req.userId, items, total, paymentMethod, paymentId, status: 'confirmed' });
        await order.save();
        await new Transaction({ userId: req.userId, orderId, amount: total, type: 'purchase', paymentId }).save();
        sendAdminAlert('New Order Placed', user, req, { orderAmount: total });
        res.status(201).json({ success: true, orderId });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/health', (req, res) => res.json({ success: true, message: 'Server running' }));

app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));