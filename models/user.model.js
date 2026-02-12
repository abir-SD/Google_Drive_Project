const mongoose = require('mongoose')
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        trim: true,
        lowercase: true,
        required: true,
        minlength: [3, 'Username must be at least 3 characters long']
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        required: true,
        unique: true,
        minlength: [10, 'Email must be at least 10 characters long']
    },
    password: {
        type: String,
        trim: true,
        minlength: [5, 'Password must be at least 5 characters long']
    },
    googleid: {
        type: String
    }
})

const user = mongoose.model('user', userSchema)

module.exports = user