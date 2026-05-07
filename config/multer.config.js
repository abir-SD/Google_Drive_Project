const multer = require('multer')
const awsStorage = require('multer-s3')
const { s3 } = require('../config/s3-config')
const spaceModel = require('../models/Space.model');
const PublicSpace = require('../models/PublicSpace.model');

// Verify bucket at runtime
const getBucket = () => {
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
        throw new Error(`AWS_S3_BUCKET not found. Please set it in Vercel Environment Variables. Current: "${bucket}"`);
    }
    return bucket;
};

// Allowed file types with their MIME types
const allowedFileTypes = {
    // Images
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    // Audio
    'audio/mpeg': ['.mp3'],
    'audio/wav': ['.wav'],
    'audio/ogg': ['.ogg'],
    'audio/webm': ['.webm'],
    // Video
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
    'video/x-msvideo': ['.avi'],
    // Documents
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    // Text
    'text/plain': ['.txt']
};

// File type filter function
const fileFilter = (req, file, cb) => {
    if (allowedFileTypes[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
};

// General-purpose storage for personal and global files
const storage = awsStorage({
    s3,
    bucket: getBucket(),
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
    bucket: getBucket(),
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
    bucket: getBucket(),
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
    storage,
    fileFilter
})

const uploadSpace = multer({ storage: spaceStorage, fileFilter });
const uploadPublicSpace = multer({ storage: publicSpaceStorage, fileFilter });


module.exports = {
    upload,
    uploadSpace,
    uploadPublicSpace
};
