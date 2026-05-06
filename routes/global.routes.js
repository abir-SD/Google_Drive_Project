const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authe');
const fileModel = require('../models/File.model');
const spaceModel = require('../models/Space.model');
const PublicSpace = require('../models/PublicSpace.model');
const counterModel = require('../models/Counter.model');
const { upload } = require('../config/multer.config');
const { getSignedDownloadUrl, getSignedViewUrl, s3ObjectExists } = require('../services/storageService');

router.get('/global', authMiddleware, async (req, res) => {
    try {
        // 1. Fetch existing public files (populate owner username so UI can show uploader)
        const publicFiles = await fileModel.find({ isPublic: true }).populate('owner', 'username');

        // 2. Fetch all Protected Spaces (populate files and each file's owner username)
        const spaces = await spaceModel.find().sort({ _id: 1 }).sort({ _id: 1 }).populate({ path: 'files', populate: { path: 'owner', select: 'username' } }).populate('owner', 'username');

        // 3. Get unlocked spaces from session
        const unlockedSpaces = (req.session && req.session.unlockedSpaces) ? req.session.unlockedSpaces : [];

        res.render('global', {
            user: req.user,
            files: publicFiles,
            spaces: spaces,
            unlockedSpaces: unlockedSpaces,
            successMsg: req.query.success,
            errorMsg: req.query.error
        });
    } catch (err) {
        console.error(err);
        res.redirect('/home?error=Failed to load Global Hub');
    }
});

router.post('/upload-global',
    authMiddleware,
    (req, res, next) => {
        req.s3Folder = `global/${req.user.username}`; // Force the folder to be 'global/username'
        next();
    },
    upload.single('file'),
    async (req, res) => {
        try {
            const newFile = new fileModel({
                owner: req.user._id,
                originalName: req.file.originalname,
                size: req.file.size,
                s3Key: req.file.key,
                isPublic: true
            });
            await newFile.save();
            
            // Increment the file counter
            await counterModel.findOneAndUpdate(
                { name: 'totalFiles' },
                { $inc: { count: 1 } },
                { upsert: true, new: true }
            );
            
            res.render('upload', { file: req.file, type: 'global', redirectTo: '/global' });
        } catch (error) {
            console.error("Upload failed:", error);
            res.render('upload', {
                file: null,
                error: 'An unexpected error occurred during the upload. Please try again.',
                redirectTo: '/global'
            });
        }
    }
);

router.get(/^\/download-public\/(.+)$/, authMiddleware, async (req, res) => {
    try {
        const s3Key = decodeURIComponent(req.params[0]);
        let file = await fileModel.findOne({ s3Key: s3Key, isPublic: true });

        // Fallback: look for file inside PublicSpace embedded docs
        if (!file) {
            const ps = await PublicSpace.findOne({ 'files.s3Key': s3Key }, { 'files.$': 1 });
            if (ps && ps.files && ps.files.length > 0) {
                const embedded = ps.files[0];
                // create a minimal file-like object
                file = { originalName: embedded.originalName, s3Key: embedded.s3Key };
            }
        }

        if (!file) return res.status(404).send('Public file not found.');

        // Check S3 availability
        try {
            const exists = await s3ObjectExists(s3Key);
            if (!exists) return res.redirect('/global?error=File+not+available+on+site');
        } catch (err) {
            console.error('S3 check error:', err);
            return res.status(500).send('Error checking file availability.');
        }

        const downloadUrl = await getSignedDownloadUrl(s3Key, file.originalName);
        return res.redirect(downloadUrl);
    } catch (err) {
        console.error('Download public error:', err);
        return res.status(500).send('Error downloading file.');
    }
});

router.get(/^\/view-public\/(.+)$/, authMiddleware, async (req, res) => {
    try {
        const s3Key = decodeURIComponent(req.params[0]);
        let file = await fileModel.findOne({ s3Key: s3Key, isPublic: true });

        // Fallback to embedded public space file if main file record not found
        if (!file) {
            const ps = await PublicSpace.findOne({ 'files.s3Key': s3Key }, { 'files.$': 1 });
            if (ps && ps.files && ps.files.length > 0) {
                file = ps.files[0];
            }
        }

        if (!file) {
            return res.status(404).send('File not found.');
        }

        // Check S3 availability
        try {
            const exists = await s3ObjectExists(s3Key);
            if (!exists) return res.redirect('/global?error=File+not+available+on+site');
        } catch (err) {
            console.error('S3 check error:', err);
            return res.status(500).send('Error checking file availability.');
        }

        const viewUrl = await getSignedViewUrl(s3Key, file.originalName);
        return res.redirect(viewUrl);

    } catch (error) {
        console.error('View error:', error);
        res.status(500).send('Error viewing file.');
    }
});

module.exports = router