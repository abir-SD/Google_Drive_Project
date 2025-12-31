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

router.post('/upload',
    authMiddleware,
    upload.single('file'),
    async (req, res) => {
        try {
            const newFile = new fileModel({
                owner: req.user._id,
                originalName: req.file.originalname,
                size: req.file.size,
                s3Key: req.file.key, // This will be "username/filename"
                isPublic: false
            });
            await newFile.save();
            res.render('upload', { file: req.file, type: 'personal', redirectTo: '/home' });
        } catch (error) {
            res.status(500).send('Personal upload failed');
        }
    }
);


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


router.post('/upload-global',
    authMiddleware,
    (req, res, next) => {
        req.s3Folder = 'global'; // Force the folder to be 'global'
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
            res.render('upload', { file: req.file, type: 'global', redirectTo: '/global' });
        } catch (error) {
            res.status(500).send('Global upload failed');
        }
    }
);

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

        // 1. Find the file and check ownership
        const file = await fileModel.findOne({
            _id: fileId,
            owner: req.user._id 
        });

        if (!file) {
            return res.status(404).send('File not found or unauthorized');
        }

        // 2. Store the public status before deleting the record
        const wasPublic = file.isPublic;

        // 3. Delete from S3
        await deleteFileFromS3(file.s3Key);

        // 4. Delete from MongoDB
        await fileModel.findByIdAndDelete(fileId);

        // 5. Dynamic Redirect based on the file type
        if (wasPublic) {
            // Redirect to global hub with success message
            res.redirect('/global?success=Public file deleted successfully');
        } else {
            // Redirect to personal home with success message
            res.redirect('/home?success=Personal file deleted successfully');
        }

    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).send('Internal Server Error');
    }
});


module.exports = router