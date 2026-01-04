const multer = require('multer')
const awsStorage = require('multer-s3')
const { s3 } = require('../config/s3-config')
const spaceModel = require('../models/Space.model');
const PublicSpace = require('../models/PublicSpace.model');

// General-purpose storage for personal and global files
const storage = awsStorage({
    s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: awsStorage.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
        const folder = req.s3Folder || `personal/${req.user.username}`;
        const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')
        const s3Key = `${folder}/${Date.now()}_${safeFileName}`
        cb(null, s3Key);
    }
})

// Specific storage for user-created spaces
const spaceStorage = awsStorage({
    s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: awsStorage.AUTO_CONTENT_TYPE,
    key: async (req, file, cb) => {
        try {
            // populate owner to get username (fallback to req.user if needed)
            const space = await spaceModel.findById(req.params.spaceId).populate('owner', 'username');
            if (!space) {
                // Handle case where space is not found
                return cb(new Error('Space not found'));
            }

            const ownerUsername = (space.owner && space.owner.username) ? space.owner.username : (req.user && req.user.username) ? req.user.username : 'unknown';
            // sanitize space name to be S3-friendly (no slashes or weird chars)
            const safeSpaceName = String(space.name).replace(/[^a-zA-Z0-9-_]/g, '_');
            const folder = `protectedSpace/${ownerUsername}/${safeSpaceName}`;
            const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
            const s3Key = `${folder}/${Date.now()}_${safeFileName}`;
            cb(null, s3Key);
        } catch (error) {
            cb(error);
        }
    }
});

// Specific storage for public spaces (User Hub)
const publicSpaceStorage = awsStorage({
    s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: awsStorage.AUTO_CONTENT_TYPE,
    key: async (req, file, cb) => {
        try {
            if (!req.params.spaceId) return cb(new Error('Space ID is missing'));
            const space = await PublicSpace.findById(req.params.spaceId).populate('owner', 'username');
            if (!space) return cb(new Error('Space not found'));

            const spaceOwnerUsername = space.owner ? space.owner.username : 'unknown';
            const safeSpaceName = String(space.name).replace(/[^a-zA-Z0-9-_]/g, '_');
            const folder = `generalSpace/${spaceOwnerUsername}/${safeSpaceName}`;
            const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
            const s3Key = `${folder}/${Date.now()}_${safeFileName}`;
            cb(null, s3Key);
        } catch (error) {
            cb(error);
        }
    }
});

const upload = multer({
    storage
})

const uploadSpace = multer({ storage: spaceStorage });
const uploadPublicSpace = multer({ storage: publicSpaceStorage });


module.exports = {
    upload,
    uploadSpace,
    uploadPublicSpace
};
