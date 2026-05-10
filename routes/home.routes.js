const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authe');
const { upload } = require('../config/multer.config');
const fileModel = require('../models/File.model');
const spaceModel = require('../models/Space.model');
const counterModel = require('../models/Counter.model');
const { getSignedDownloadUrl, getSignedViewUrl, deleteFileFromS3, s3ObjectExists } = require('../services/storageService');

router.get('/home', authMiddleware, async (req, res) => {

    // Only show personal (non-public) files on the Home page. Exclude files that belong to a space.
    const userFiles = await fileModel.find({
        owner: req.user._id,
        isPublic: false,
        space: null
    })

    // Capture messages from query parameters
    const successMsg = req.query.success;
    const errorMsg = req.query.error;

    res.render('home', {
        files: userFiles,
        successMsg: successMsg,
        errorMsg: errorMsg
    });
})

router.post('/upload',
    authMiddleware,
    upload.array('file'),
    async (req, res) => {
        try {
                        if (!req.files || req.files.length === 0) {
                if (req.headers.accept && req.headers.accept.includes('application/json')) {
                    return res.status(400).json({
                        success: false,
                        message: 'No files were uploaded.'
                    });
                }
                return res.render('upload', {
                    file: null,
                    error: 'No files were uploaded.',
                    redirectTo: '/home'
                });
            }
            
            const uploadedFiles = [];
            for (const file of req.files) {
                const newFile = new fileModel({
                    owner: req.user._id,
                    originalName: file.originalname,
                    size: file.size,
                    mimetype: file.mimetype,
                    s3Key: file.key,
                    isPublic: false
                });
                await newFile.save();
                uploadedFiles.push(newFile);
            }
            
            // Increment the file counter by number of files uploaded
            await counterModel.findOneAndUpdate(
                { name: 'totalFiles' },
                { $inc: { count: req.files.length } },
                { upsert: true, new: true }
            );
            
            // Check if this is an AJAX request
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(201).json({
                    success: true,
                    message: `${req.files.length} file(s) uploaded successfully`,
                    files: uploadedFiles,
                    isMultiple: req.files.length > 1
                });
            }

            res.render('upload', { file: uploadedFiles, type: 'personal', redirectTo: '/home', isMultiple: true });
                } catch (error) {
            console.error("Upload failed:", error);
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(500).json({
                    success: false,
                    message: 'An unexpected error occurred during the upload. Please try again.'
                });
            }
            res.render('upload', {
                file: null,
                error: 'An unexpected error occurred during the upload. Please try again.',
                redirectTo: '/home'
            });
        }
    }
);

router.get(/^\/download\/(.+)$/, authMiddleware, async (req, res) => {
    try {
        const s3Key = decodeURIComponent(req.params[0]);


        // Find the file by exact s3Key
        const file = await fileModel.findOne({ s3Key: s3Key });

        if (!file) {
            return res.status(404).send('File not found.');
        }

        if (!file.owner.equals(req.user._id)) {
            return res.status(403).send('You do not have permission to access this file.');
        }

        // Check object exists on S3 before redirecting
        let exists;
        try {
            exists = await s3ObjectExists(file.s3Key);
        } catch (err) {
            console.error('S3 check error:', err);
            return res.status(500).send('Error checking file availability.');
        }
        if (!exists) {
            return res.redirect('/home?error=File+not+available+on+site');
        }

        const downloadUrl = await getSignedDownloadUrl(file.s3Key, file.originalName);
        return res.redirect(downloadUrl);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send('Error downloading file.');
    }
});

router.get(/^\/view\/(.+)$/, authMiddleware, async (req, res) => {
    try {
        const s3Key = decodeURIComponent(req.params[0]);
        const file = await fileModel.findOne({ s3Key: s3Key });

        if (!file) {
            return res.status(404).send('File not found.');
        }

        if (!file.owner.equals(req.user._id)) {
            return res.status(403).send('You do not have permission to access this file.');
        }

        let exists;
        try {
            exists = await s3ObjectExists(file.s3Key);
        } catch (err) {
            console.error('S3 check error:', err);
            return res.status(500).send('Error checking file availability.');
        }
        if (!exists) {
            return res.redirect('/home?error=File+not+available+on+site');
        }

        const viewUrl = await getSignedViewUrl(file.s3Key, file.originalName);
        return res.redirect(viewUrl);
    } catch (error) {
        console.error('View error:', error);
        res.status(500).send('Error opening file.');
    }
});

router.delete('/delete/:fileId', authMiddleware, async (req, res) => {
    try {
        const file = await fileModel.findById(req.params.fileId);
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found.' });
        }

        // Load space if present
        let space = null;
        if (file.space) {
            space = await spaceModel.findById(file.space);
        }

        // Authorize: user must be file owner OR space owner
        const isFileOwner = file.owner && file.owner.toString() === req.user._id.toString();
        const isSpaceOwner = space && space.owner && space.owner.toString() === req.user._id.toString();

        let canDelete = isFileOwner || isSpaceOwner;

        // If space allows delete, check if user has unlocked the space
        if (!canDelete && space && space.allowDelete) {
            const unlockedSpaces = (req.session && req.session.unlockedSpaces) ? req.session.unlockedSpaces : [];
            if (unlockedSpaces.includes(space._id.toString())) {
                canDelete = true;
            }
        }

        if (!canDelete) {
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this file.' });
        }

        // Delete from S3
        try {
            await deleteFileFromS3(file.s3Key);
        } catch (e) {
            console.warn('S3 delete failed but continuing DB deletion:', e.message);
        }

        // If it's a space file, remove reference from space
        if (space) {
            space.files.pull(file._id);
            await space.save();
        }

        // Delete the file document
        await fileModel.findByIdAndDelete(req.params.fileId);

        res.json({ success: true, message: 'File deleted successfully.' });

    } catch (err) {
        console.error('Error deleting file:', err);
        res.status(500).json({ success: false, message: 'An internal error occurred while deleting the file.' });
    }
});

module.exports = router