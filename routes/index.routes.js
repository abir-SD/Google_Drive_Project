const express = require('express')
const https = require('https');
const authMiddleware = require('../middlewares/authe')
const { uploadFileToS3, getSignedDownloadUrl, getSignedViewUrl } = require('../services/storageService')

const router = express.Router()
const upload = require('../config/multer.config')
const fileModel = require('../models/File.model')



router.get('/welcome', (req, res) => {

    res.render('welcome')
})

router.get('/home', authMiddleware, async (req, res) => {

    const userFiles = await fileModel.find({
        owner: req.user._id
    })

    res.render('home', {
        files: userFiles
    })
})


router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    if (!req.file) {
        // return res.status(400).send('No file uploaded.');
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

    res.render('upload', { file: req.file });


})


// router.get('/download/:path', authMiddleware, async (req, res) => {
//     try {
//         const s3Key = req.params.path;
//         const file = await fileModel.findOne({ s3Key: s3Key });

//         if (!file) {
//             return res.status(404).send('File not found.');
//         }

//         if (!file.owner.equals(req.user._id)) {
//             return res.status(403).send('You do not have permission to access this file.');
//         }

//         const downloadUrl = await getSignedDownloadUrl(s3Key, file.originalName);

//         res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);

//         https.get(downloadUrl, (s3Response) => {
//             s3Response.pipe(res);
//         }).on('error', (err) => {
//             console.error('Error streaming file from S3:', err);
//             res.status(500).send('Error downloading file.');
//         });

//     } catch (error) {
//         console.error('Download error:', error);
//         res.status(500).send('Error downloading file.');
//     }
// });

// index.router.js

// index.router.js

router.get('/download/:username/:filename', authMiddleware, async (req, res) => {
    try {
        const s3Key = `${req.params.username}/${req.params.filename}`;
        const file = await fileModel.findOne({ s3Key: s3Key });

        if (!file) {
            return res.status(404).send('File not found.');
        }

        // KEEP THIS LINE! This prevents a user from downloading someone else's file.
        if (!file.owner.equals(req.user._id)) {
            return res.status(403).send('You do not have permission to access this file.');
        }

        const downloadUrl = await getSignedDownloadUrl(s3Key, file.originalName);

        // FIX: Redirect to the pre-signed S3 URL for reliable download, 
        // instead of streaming it through the Express server.
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


module.exports = router