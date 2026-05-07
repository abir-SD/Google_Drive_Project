const mongoose = require('mongoose')

const connectToDB = async () => {
    // Check if we already have a connection (1 = connected, 2 = connecting)
    if (mongoose.connection.readyState >= 1) {
        return;
    }

    try {
        await mongoose.connect(process.env.DB_CONNECTION_STRING);
        console.log('connected to db');
    } catch (err) {
        console.error('DB connection error');
        if (process.env.NODE_ENV !== 'production') {
            console.error(err.message);
        }
        throw err;
    }
}

module.exports = connectToDB