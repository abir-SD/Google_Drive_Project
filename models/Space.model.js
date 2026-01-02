const mongoose = require('mongoose');

const spaceSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    // We link files to this space
    files: [{ type: mongoose.Schema.Types.ObjectId, ref: 'file' }]
});

module.exports = mongoose.model('space', spaceSchema);