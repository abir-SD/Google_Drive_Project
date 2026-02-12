const mongoose = require('mongoose')

const counterSchema = new mongoose.Schema({
    name: {
        type: String,
        unique: true,
        required: true
    },
    count: {
        type: Number,
        default: 0
    }
})

module.exports = mongoose.model('counter', counterSchema);
