const mongoose = require('mongoose')

const connectToDB = () => {
    // Return the mongoose connection promise so callers can await/chain
    return mongoose.connect(process.env.DB_CONNECTION_STRING)
        .then(() => {
            // Clear previous console noise and print a clean message
            console.clear();
            console.log('connected to db');
        })
        .catch(err => {
            // Minimal error output (no stack) — keep console tidy while surfacing failure
            console.error('DB connection error');
            if (process.env.NODE_ENV !== 'production') console.error(err.message);
            throw err;
        });
}

module.exports = connectToDB