const express = require('express')
const authMiddleware = require('../middlewares/authe')
const { uploadFileToS3, getSignedDownloadUrl, getSignedViewUrl, deleteFileFromS3 } = require('../services/storageService')
const userModel = require('../models/user.model');

const router = express.Router()
const upload = require('../config/multer.config')
const fileModel = require('../models/File.model')



router.get('/welcome', (req, res) => {

    res.render('welcome')
})

router.get('/about', (req, res) => {

    res.render('about')
})

router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/welcome');
});

router.get('/home', authMiddleware, async (req, res) => {

    const userFiles = await fileModel.find({
        owner: req.user._id
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

router.get('/members', async (req, res) => {
    try {
        const allUsers = await userModel.find({}, 'username email');
        const totalFiles = await fileModel.countDocuments();

        res.render('members', {
            users: allUsers,
            count: allUsers.length,
            totalFiles: totalFiles
        });

    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send("Server Error");
    }
});

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            res.render('upload');
            return;
        }

        // Multer-s3 uploads directly to S3; use the returned key
        const s3Key = req.file.key || (req.file.location && req.file.location.split('.amazonaws.com/')[1]);

        const newFile = new fileModel({
            owner: req.user._id,
            originalName: req.file.originalname,
            size: req.file.size,
            s3Key: s3Key,
            isPublic: false
        })

        await newFile.save();

        res.render('upload', { file: req.file, type: 'personal', redirectTo: '/home' });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).send('Error uploading file.');
    }
})


router.get('/download/:username/:filename', authMiddleware, async (req, res) => {
    try {
        const s3Key = `${req.params.username}/${req.params.filename}`;
        const file = await fileModel.findOne({ s3Key: s3Key });

        if (!file) {
            return res.status(404).send('File not found.');
        }

        if (!file.owner.equals(req.user._id)) {
            return res.status(403).send('You do not have permission to access this file.');
        }

        const downloadUrl = await getSignedDownloadUrl(s3Key, file.originalName);
        return res.redirect(downloadUrl);

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send('Error downloading file.');
    }
});


router.get('/view/:username/:filename', authMiddleware, async (req, res) => {
    try {
        const s3Key = `${req.params.username}/${req.params.filename}`;
        const file = await fileModel.findOne({ s3Key: s3Key });

        if (!file) {
            return res.status(404).send('File not found.');
        }

        if (!file.owner.equals(req.user._id)) {
            return res.status(403).send('You do not have permission to access this file.');
        }

        const viewUrl = await getSignedViewUrl(s3Key, file.originalName);
        return res.redirect(viewUrl);

    } catch (error) {
        console.error('View error:', error);
        res.status(500).send('Error viewing file.');
    }
});

// For Global file

router.get('/global', authMiddleware, async (req, res) => {
    // Add .populate('owner', 'username') to join the user data
    const publicFiles = await fileModel.find({ isPublic: true }).populate('owner', 'username');
    res.render('global', { files: publicFiles });
});


router.post('/upload-global', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.render('upload', { file: null, type: 'global' });
        }

        // Multer-s3 already stored the file; use the returned key
        const s3Key = req.file.key || (req.file.location && req.file.location.split('.amazonaws.com/')[1]);

        const newFile = new fileModel({
            owner: req.user._id,
            originalName: req.file.originalname,
            size: req.file.size,
            s3Key: s3Key,
            isPublic: true
        });

        await newFile.save();
        res.render('upload', { file: req.file, type: 'global', redirectTo: '/global' });
    } catch (error) {
        console.error('Global upload error:', error);
        res.status(500).send('Error uploading file.');
    }
});

router.get(/^\/download-public\/(.+)$/, authMiddleware, async (req, res) => {
    const s3Key = req.params[0];
    const file = await fileModel.findOne({ s3Key: s3Key, isPublic: true });

    if (!file) return res.status(404).send('Public file not found.');

    const downloadUrl = await getSignedDownloadUrl(s3Key, file.originalName);
    return res.redirect(downloadUrl);
});

router.get(/^\/view-public\/(.+)$/, authMiddleware, async (req, res) => {
    try {
        const s3Key = req.params[0];
        const file = await fileModel.findOne({ s3Key: s3Key, isPublic: true });

        if (!file) {
            return res.status(404).send('File not found.');
        }

        const viewUrl = await getSignedViewUrl(s3Key, file.originalName);
        return res.redirect(viewUrl);

    } catch (error) {
        console.error('View error:', error);
        res.status(500).send('Error viewing file.');
    }
});

// For deleting files

router.get('/delete/:fileId', authMiddleware, async (req, res) => {
    try {
        const fileId = req.params.fileId;

        // 1. Find the file to ensure the logged-in user owns it
        const file = await fileModel.findOne({
            _id: fileId,
            owner: req.user._id // Security check: Only owner can delete
        });

        if (!file) {
            return res.status(404).send('File not found or unauthorized');
        }

        // 2. Delete from S3 using the stored key
        await deleteFileFromS3(file.s3Key);

        // 3. Delete from MongoDB
        await fileModel.findByIdAndDelete(fileId);

        // Redirect with a success message in the URL
        res.redirect('/home?success=File deleted successfully');
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).send('Internal Server Error');
    }
});


module.exports = router