const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI ;

console.log("Attempting to connect to MongoDB...");

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('✅ Connected to MongoDB successfully!');
    
    // List all databases
    mongoose.connection.db.admin().listDatabases((err, result) => {
        if (err) {
            console.error('Error listing databases:', err);
            process.exit(1);
        }
        
        console.log('\n📊 Available databases:');
        result.databases.forEach(db => {
            console.log(`- ${db.name} (Size: ${db.sizeOnDisk} bytes)`);
        });
        
        // Check if our database exists
        const ourDb = result.databases.find(db => db.name === 'blinkit_clone');
        if (ourDb) {
            console.log('\n✅ blinkit_clone database exists!');
        } else {
            console.log('\nℹ️ blinkit_clone database does not exist yet. It will be created when we add data.');
        }
        
        process.exit(0);
    });
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});