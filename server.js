const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT ;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI ;

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Define schemas
const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    items: [{
        id: String,
        name: String,
        price: Number,
        quantity: Number
    }],
    total: {
        type: Number,
        required: true
    },
    paymentId: String,
    paymentMethod: {
        type: String,
        required: true
    },
    upiId: String,
    customerName: String,
    customerEmail: String,
    status: {
        type: String,
        default: 'pending'
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    upiId: String,
    orders: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create models
const Order = mongoose.model('Order', orderSchema);
const User = mongoose.model('User', userSchema);

// API routes
app.post('/api/orders', async (req, res) => {
    try {
        const { items, total, paymentId, paymentMethod, upiId, customerName, customerEmail } = req.body;
        
        // Generate a unique order ID
        const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        const order = new Order({
            orderId,
            items,
            total,
            paymentId,
            paymentMethod,
            upiId,
            customerName,
            customerEmail
        });
        
        await order.save();
        
        // Check if user exists, if not create one
        let user = await User.findOne({ email: customerEmail });
        if (!user) {
            user = new User({
                name: customerName,
                email: customerEmail,
                upiId: upiId
            });
        }
        
        // Add order to user's orders
        user.orders.push(order._id);
        await user.save();
        
        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            orderId: order.orderId,
            order
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: error.message
        });
    }
});

// Get all orders
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ date: -1 });
        res.json({
            success: true,
            orders
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
});

// Get order by ID
app.get('/api/orders/:orderId', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order',
            error: error.message
        });
    }
});

// Get user by email and their orders
app.get('/api/users/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email }).populate('orders');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user',
            error: error.message
        });
    }
});

// Update order status
app.put('/api/orders/:orderId', async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findOneAndUpdate(
            { orderId: req.params.orderId },
            { status },
            { new: true }
        );
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Order status updated successfully',
            order
        });
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order',
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});