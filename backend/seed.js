const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    weight: String,
    image: String,
    popularity: Number,
    category: String,
    createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: 'student' },
    address: String,
    phone: String,
    profileImage: String,
    canteenId: String,
    rollNumber: String
});

const Product = mongoose.model('Product', productSchema);
const User = mongoose.model('User', userSchema);

const defaultProducts = [
    { name: "Chole Bhature", price: 120, weight: "2 Bhature + Chole", image: "https://madhurasrecipe.com/wp-content/uploads/2025/09/MR-Chole-Bhature-featured.jpg", popularity: 8, category: 'Breakfast' },
    { name: "Samosa", price: 40, weight: "1 piece", image: "https://recipes.timesofindia.com/thumb/61050397.cms?width=1200&height=900", popularity: 10, category: 'Snacks' },
    { name: "Veg Puff", price: 25, weight: "1 piece", image: "https://www.elloras.in/cdn/shop/products/Mushroom-Puff_693x.jpg?v=1660911957", popularity: 9, category: 'Snacks' },
    { name: "Hot Coffee", price: 30, weight: "1 cup", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTa0tizr4Mp3AZDTp-nJLGAp5QQsQhC2u0PNw&s", popularity: 7, category: 'Beverages' },
    { name: "Chole Kulche", price: 80, weight: "2 kulche + chole", image: "https://media-assets.swiggy.com/swiggy/image/upload/f_auto,q_auto,fl_lossy/pdwsoobxs6wzul1jqljr", popularity: 7, category: 'Lunch' },
    { name: "Aloo Paratha", price: 60, weight: "2 pieces", image: "https://www.indianhealthyrecipes.com/wp-content/uploads/2020/08/aloo-paratha-recipe-500x500.jpg", popularity: 6, category: 'Breakfast' },
    { name: "Coca-Cola 1L", price: 20, weight: "1 litre", image: "https://www.coca-cola.com/content/dam/onexp/us/en/brands/coca-cola-spiced/coke-product-category-card.png", popularity: 5, category: 'Beverages' },
    { name: "Dairy Milk", price: 35, weight: "45g", image: "https://m.media-amazon.com/images/I/718ecxjECuL.jpg", popularity: 6, category: 'Snacks' }
];

async function runSeed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // Seed Admin if missing
        const adminExists = await User.findOne({ email: 'DA@gmail.com' });
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
            console.log('Admin seeded');
        }

        // Seed Products
        for (const p of defaultProducts) {
            const exists = await Product.findOne({ name: p.name });
            if (!exists) {
                await Product.create(p);
                console.log(`Seeded: ${p.name}`);
            }
        }

        console.log('Seeding complete');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

runSeed();
