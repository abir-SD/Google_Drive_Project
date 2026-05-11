const mongoose = require('mongoose')

const connectToDB = async () => {
    // Check if we already have a connection (1 = connected, 2 = connecting)
    if (mongoose.connection.readyState >= 1) {
        console.log('📍 [DB] Already connected, skipping...');
        return;
    }

    try {
        console.log('📍 [DB] Attempting to connect...');
        
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database connection timeout')), 10000)
        );
        
        const connectionPromise = mongoose.connect(process.env.DB_CONNECTION_STRING, {
            socketTimeoutMS: 10000,     // 10 seconds for socket timeout
            serverSelectionTimeoutMS: 10000,  // 10 seconds for server selection
            connectTimeoutMS: 10000,    // 10 seconds for connection
            retryWrites: true,
            w: 'majority'
        });
        
        // Race between connection and timeout
        await Promise.race([connectionPromise, timeoutPromise]);
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