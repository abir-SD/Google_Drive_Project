const express = require('express')
const authMiddleware = require('../middlewares/authe')
const { uploadFileToS3, getSignedDownloadUrl } = require('../services/storageService')

const router = express.Router()
const upload = require('../config/multer.config')
const fileModel = require('../models/File.model')



router.get('/welcome', (req, res) => {

    res.render('welcome')
})

router.get('/home', authMiddleware, async (req, res) => {

    const userFiles = await fileModel.find({
        owner: req.user.userId
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
        owner: req.user.userId,
        originalName: req.file.originalname,
        size: req.file.size,
        s3Key: req.file.key
    })

    await newFile.save();

    // res.json(newFile)
    res.render('upload', { file: req.file })


})


router.get('/download/:path', authMiddleware, async (req, res) => {
    try {
        const s3Key = req.params.path;
        const file = await fileModel.findOne({ s3Key: s3Key });

        if (!file) {
            return res.status(404).send('File not found.');
        }

        if (file.owner.toString() !== req.user.userId) {
            return res.status(403).send('You do not have permission to access this file.');
        }

        const downloadUrl = await getSignedDownloadUrl(s3Key, file.originalName);
        res.redirect(downloadUrl);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send('Error downloading file.');
    }
})



module.exports = router