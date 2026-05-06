const mongoose = require('mongoose');

const spaceSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    // We link files to this space
    allowDownloads: { type: Boolean, default: true },
    allowDelete: { type: Boolean, default: false },
    files: [{ type: mongoose.Schema.Types.ObjectId, ref: 'file' }]
});

// Ensure that a single owner cannot create two spaces with the same name (case-insensitive)
spaceSchema.index({ owner: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const Space = mongoose.model('space', spaceSchema);

// On DB connection, check for and remove any stray unique index on owner only, which would prevent multiple spaces per owner
mongoose.connection.on('open', async () => {
    try {
        const indexes = await Space.collection.indexes();

        // 1) Remove stray unique index on owner-only (if any) — do this silently to avoid noisy startup logs
        for (const idx of indexes) {
            if (idx.unique && Object.keys(idx.key).length === 1 && idx.key.owner === 1) {
                try {
                    await Space.collection.dropIndex(idx.name);
                } catch (dropErr) {
                    // ignore drop failures silently
                    console.log('Drop failures', dropErr)
                }
            }
        }

        // 2) Only create the compound owner+name index if an index with that key doesn't already exist.
        const hasOwnerNameIdx = indexes.some(idx => idx.key && idx.key.owner === 1 && idx.key.name === 1);
        if (!hasOwnerNameIdx) {
            try {
                await Space.collection.createIndex({ owner: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
            } catch (e) {
                // Ignore createIndex failures to keep startup console clean (index may already exist with slightly different specs)
                console.log('CreateIndex failures', e)
            }
        }

        // No informational logs here so the console stays minimal
    } catch (e) {
        // Keep startup silent on index management; errors will surface elsewhere if they matter
        console.log('Index management', e)
    }
});

module.exports = Space;