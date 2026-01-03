const mongoose = require('mongoose');

const publicSpaceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    files: [{
        originalName: String,
        s3Key: String,
        size: Number,
        mimetype: String,
        uploadDate: {
            type: Date,
            default: Date.now
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user'
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const PublicSpace = mongoose.model('publicSpace', publicSpaceSchema);

module.exports = PublicSpace;