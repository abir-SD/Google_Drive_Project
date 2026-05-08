const mongoose = require('mongoose')

const connectToDB = async () => {
    // Check if we already have a connection (1 = connected, 2 = connecting)
    if (mongoose.connection.readyState >= 1) {
        console.log('📍 [DB] Already connected, skipping...');
        return;
    }

    try {
        console.log('📍 [DB] Attempting to connect...');
        await mongoose.connect(process.env.DB_CONNECTION_STRING, {
            socketTimeoutMS: 45000,     // 45 seconds for socket timeout
            serverSelectionTimeoutMS: 45000,  // 45 seconds for server selection
            connectTimeoutMS: 45000,    // 45 seconds for connection
            retryWrites: true,
            w: 'majority'
        });
        console.log('✅ [DB] Connected to MongoDB successfully');
    } catch (err) {
        console.error('❌ [DB] Connection error');
        if (process.env.NODE_ENV !== 'production') {
            console.error('❌ [DB] Error details:', err.message);
        }
        throw err;
    }
}

module.exports = connectToDB