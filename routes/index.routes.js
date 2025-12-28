const express = require('express')
const authMiddleware = require('../middlewares/authe')
const { uploadFileToS3, getSignedDownloadUrl, getSignedViewUrl } = require('../services/storageService')
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

router.get('/home', authMiddleware, async (req, res) => {

    const userFiles = await fileModel.find({
        owner: req.user._id
    })

    res.render('home', {
        files: userFiles
    })
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

        const newFile = new fileModel({
            owner: req.user._id,
            originalName: req.file.originalname,
            size: req.file.size,
            s3Key: req.file.key
        })

        await newFile.save();

        res.render('upload', { file: req.file, type: 'personal' });
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
    const publicFiles = await fileModel.find({ isPublic: true });
    res.render('global', { files: publicFiles });
});


router.post('/upload-global', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.render('upload', { file: null, type: 'global' });
        }

        const newFile = new fileModel({
            owner: req.user._id,
            originalName: req.file.originalname,
            size: req.file.size,
            s3Key: req.file.key,
            isPublic: true
        });

        await newFile.save();
        res.render('upload', { file: req.file, type: 'global' });
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


module.exports = router