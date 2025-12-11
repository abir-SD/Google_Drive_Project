const mongoose = require('mongoose')

const fileSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    },
    originalName: String,
    size: Number,
    s3Key: {
        type: String,
        unique: true,
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now

    }
})

module.exports = mongoose.model('file', fileSchema);