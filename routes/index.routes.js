const express = require('express')
const authMiddleware = require('../middlewares/authe')
const { uploadFileToS3, getSignedDownloadUrl, getSignedViewUrl, deleteFileFromS3 } = require('../services/storageService')
const archiver = require('archiver');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../config/s3-config');
const userModel = require('../models/user.model');
const bcrypt = require('bcrypt');

const router = express.Router()
const { upload, uploadSpace } = require('../config/multer.config')
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
router.get('/space', authMiddleware, async (req, res) => {
    try {
        // 1. Fetch all Protected Spaces (populate files and each file's owner)
        // Ensure spaceModel is required at the top of your file
        const spaces = await spaceModel.find()
            .populate({ path: 'files', populate: { path: 'owner', select: 'username' } })
            .populate('owner', 'username');

        // 2. Get unlocked spaces from session
        const unlockedSpaces = (req.session && req.session.unlockedSpaces) ? req.session.unlockedSpaces : [];

        res.render('space', {
            user: req.user,
            spaces: spaces,
            unlockedSpaces: unlockedSpaces,
            successMsg: req.query.success,
            errorMsg: req.query.error
        });
    } catch (error) {
        console.error("Error loading space page:", error);
        res.status(500).send("Internal Server Error");
    }
});

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
const spaceModel = require('../models/Space.model');

// UPDATED GLOBAL ROUTE
router.get('/global', authMiddleware, async (req, res) => {
    try {
        // 1. Fetch existing public files (populate owner username so UI can show uploader)
        const publicFiles = await fileModel.find({ isPublic: true }).populate('owner', 'username');

        // 2. Fetch all Protected Spaces (populate files and each file's owner username)
        const spaces = await spaceModel.find().populate({ path: 'files', populate: { path: 'owner', select: 'username' } }).populate('owner', 'username');

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

    if (!file) return res.status(404).send('Public file not. Not found.');

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




// NEW SPACE ROUTES
router.post('/create-space', authMiddleware, async (req, res) => {
    try {
        const { name, password } = req.body;
        if (!name || !password) {
            return res.status(400).json({ success: false, message: 'Name and password are required.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newSpace = await spaceModel.create({
            name,
            password: hashedPassword,
            owner: req.user._id
        });

        // Populate owner username before returning so client can render immediately
        await newSpace.populate('owner', 'username');

        // Return a clean plain object with ownerUsername for convenience
        const spaceObj = newSpace.toObject();
        spaceObj.ownerUsername = (newSpace.owner && newSpace.owner.username) ? newSpace.owner.username : req.user.username;

        res.status(201).json({ success: true, space: spaceObj });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to create space', error: err.message });
    }
});

router.post('/unlock-space/:spaceId', authMiddleware, async (req, res) => {
    const { password } = req.body;
    const space = await spaceModel.findById(req.params.spaceId);

    if (space && await bcrypt.compare(password, space.password)) {
        if (!req.session.unlockedSpaces) req.session.unlockedSpaces = [];
        const sid = req.params.spaceId.toString();
        if (!req.session.unlockedSpaces.includes(sid)) req.session.unlockedSpaces.push(sid);
        // ensure session saved before redirect
        return req.session.save(err => {
            if (err) console.warn('Session save error:', err);
            return res.redirect('/global');
        });
    }
    res.redirect('/global?error=Incorrect Password');
});

router.post('/upload-space/:spaceId', authMiddleware, uploadSpace.single('file'), async (req, res) => {
    try {
        // Load space and owner username to add into file doc
        const space = await spaceModel.findById(req.params.spaceId).populate('owner', 'username');
        if (!space) return res.redirect('/global?error=Space not found');
        if (space.owner._id.toString() !== req.user._id.toString()) {
            return res.redirect('/global?error=Only owners can upload');
        }

        const newFile = await fileModel.create({
            s3Key: req.file.key,
            originalName: req.file.originalname,
            size: req.file.size,
            owner: req.user._id,
            isPublic: false, // Keeping it private within the space
            space: space._id,
            spaceName: space.name,
            spaceOwnerUsername: space.owner.username || req.user.username
        });

        space.files.push(newFile._id);
        await space.save();
        res.redirect('/global?success=File uploaded to space');
    } catch (err) {
        console.error('Upload to space error:', err);
        res.redirect('/global?error=Upload failed');
    }
});

router.delete('/space/:spaceId', authMiddleware, async (req, res) => {
    try {
        const space = await spaceModel.findById(req.params.spaceId).populate('files');
        if (!space) {
            return res.status(404).json({ success: false, message: 'Space not found' });
        }
        if (space.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'You are not the owner of this space' });
        }

        // Delete all files from S3 and MongoDB
        for (const file of space.files) {
            try {
                await deleteFileFromS3(file.s3Key);
            } catch (e) {
                console.warn('Error deleting file from S3:', file.s3Key, e.message);
            }
            await fileModel.findByIdAndDelete(file._id);
        }

        // Delete the space
        await spaceModel.findByIdAndDelete(req.params.spaceId);

        res.json({ success: true, message: 'Space deleted successfully' });
    } catch (err) {
        console.error('Error deleting space:', err);
        res.status(500).json({ success: false, message: 'Failed to delete space' });
    }
});

// Delete a single file (used by Home and inside Spaces). Works for personal and space files.
router.get('/delete/:fileId', authMiddleware, async (req, res) => {
    try {
        const file = await fileModel.findById(req.params.fileId);
        if (!file) return res.redirect('/home?error=File not found');

        // Load space if present
        let space = null;
        if (file.space) space = await spaceModel.findById(file.space);

        // Ensure we have owner objects (in case not populated)
        const fileOwnerId = (file.owner && file.owner._id) ? file.owner._id.toString() : (file.owner ? file.owner.toString() : null);
        const spaceOwnerId = (space && space.owner && space.owner._id) ? space.owner._id.toString() : (space && space.owner ? space.owner.toString() : null);
        const isFileOwner = fileOwnerId && fileOwnerId === req.user._id.toString();
        const isSpaceOwner = spaceOwnerId && spaceOwnerId === req.user._id.toString();
        if (!isFileOwner && !isSpaceOwner) {
            const redirectTo = (file.isPublic || space) ? '/global' : '/home';
            return res.redirect(`${redirectTo}?error=Not authorized to delete`);
        }

        // Delete from S3
        try { await deleteFileFromS3(file.s3Key); } catch (e) { console.warn('S3 delete failed:', e.message); }

        // Remove from space.files if applicable
        if (space) {
            space.files = space.files.filter(fId => fId.toString() !== file._id.toString());
            await space.save();
        }

        await fileModel.findByIdAndDelete(file._id);

        // Redirect to appropriate place
        // If file belonged to a space or was public, return to /global; otherwise back to /home
        const redirectTo = (space || file.isPublic) ? '/global' : '/home';
        return res.redirect(`${redirectTo}?success=File deleted`);
    } catch (err) {
        console.error('Error deleting file:', err);
        return res.redirect('/home?error=Failed to delete file');
    }
});

// View a file that belongs to a space (redirects to signed URL)
router.get('/view-space/:fileId', authMiddleware, async (req, res) => {
    try {
        const file = await fileModel.findById(req.params.fileId);
        if (!file) return res.status(404).send('File not found');

        if (!file.space) return res.status(400).send('Not a space file');

        const space = await spaceModel.findById(file.space);
        if (!space) return res.status(404).send('Space not found');

        // Check access: space owner OR unlocked or file owner
        const unlockedSpaces = (req.session && req.session.unlockedSpaces) ? req.session.unlockedSpaces : [];
        const isSpaceOwner = space.owner.toString() === req.user._id.toString();
        const isFileOwner = file.owner.toString() === req.user._id.toString();
        const isUnlocked = unlockedSpaces.includes(space._id.toString()) || isSpaceOwner;
        if (!isUnlocked && !isFileOwner) return res.status(403).send('Not authorized to view this file');

        const viewUrl = await getSignedViewUrl(file.s3Key, file.originalName);
        return res.redirect(viewUrl);
    } catch (err) {
        console.error('View space file error:', err);
        return res.status(500).send('Error fetching file');
    }
});

// Download a file that belongs to a space (redirects to signed URL)
router.get('/download-space/:fileId', authMiddleware, async (req, res) => {
    try {
        const file = await fileModel.findById(req.params.fileId);
        if (!file) return res.status(404).send('File not found');

        if (!file.space) return res.status(400).send('Not a space file');

        const space = await spaceModel.findById(file.space);
        if (!space) return res.status(404).send('Space not found');

        // Check access: space owner OR unlocked or file owner
        const unlockedSpaces = (req.session && req.session.unlockedSpaces) ? req.session.unlockedSpaces : [];
        const isSpaceOwner = space.owner.toString() === req.user._id.toString();
        const isFileOwner = file.owner.toString() === req.user._id.toString();
        const isUnlocked = unlockedSpaces.includes(space._id.toString()) || isSpaceOwner;
        if (!isUnlocked && !isFileOwner) return res.status(403).send('Not authorized to download this file');

        const downloadUrl = await getSignedDownloadUrl(file.s3Key, file.originalName);
        return res.redirect(downloadUrl);
    } catch (err) {
        console.error('Download space file error:', err);
        return res.status(500).send('Error fetching file');
    }
});

// Download all files in a space as a zip (only for authorized users)
router.get('/download-space-all/:spaceId', authMiddleware, async (req, res) => {
    try {
        const space = await spaceModel.findById(req.params.spaceId).populate({ path: 'files', populate: { path: 'owner', select: 'username' } }).populate('owner', 'username');
        if (!space) return res.status(404).send('Space not found');

        // Check access
        const unlockedSpaces = (req.session && req.session.unlockedSpaces) ? req.session.unlockedSpaces : [];
        const isSpaceOwner = space.owner && space.owner._id && space.owner._id.toString() === req.user._id.toString();
        const isUnlocked = unlockedSpaces.includes(space._id.toString()) || isSpaceOwner;
        if (!isUnlocked) return res.status(403).send('Not authorized to download space files');

        // Prepare zip
        res.setHeader('Content-Type', 'application/zip');
        const safeSpaceName = String(space.name).replace(/[^a-zA-Z0-9-_]/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${safeSpaceName}.zip"`);

        const archive = archiver('zip');
        archive.on('error', err => { throw err; });
        archive.pipe(res);

        for (const file of space.files) {
            try {
                const cmd = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: file.s3Key });
                const data = await s3.send(cmd);
                archive.append(data.Body, { name: file.originalName });
            } catch (e) {
                console.warn('Failed to append file to archive:', file.s3Key, e.message);
            }
        }

        await archive.finalize();
    } catch (err) {
        console.error('Download space all error:', err);
        return res.status(500).send('Failed to create zip');
    }
});


module.exports = router