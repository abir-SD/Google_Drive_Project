const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authe');
const spaceModel = require('../models/Space.model');
const fileModel = require('../models/File.model');
const { uploadSpace } = require('../config/multer.config');
const bcrypt = require('bcrypt');
const { deleteFileFromS3, getSignedViewUrl, getSignedDownloadUrl } = require('../services/storageService');
const archiver = require('archiver');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../config/s3-config');

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

router.post('/create-space', authMiddleware, async (req, res) => {
    try {
        const { name, password, allowDelete, allowDownloads } = req.body;
        if (!name || !password) {
            return res.status(400).json({ success: false, message: 'Name and password are required.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newSpace = await spaceModel.create({
            name,
            password: hashedPassword,
            owner: req.user._id,
            allowDelete: String(allowDelete) === 'true',
            allowDownloads: String(allowDownloads) === 'true'
        });

        // Populate owner username before returning so client can render immediately
        await newSpace.populate('owner', 'username');

        // Return a clean plain object with ownerUsername for convenience
        const spaceObj = newSpace.toObject();
        spaceObj.ownerUsername = (newSpace.owner && newSpace.owner.username) ? newSpace.owner.username : req.user.username;

        res.status(201).json({ success: true, space: spaceObj });
    } catch (err) {
        console.error('Error creating space:', err);
        if (err && err.code === 11000) {
            // Deduce which key caused the duplicate error and return a helpful message
            const dupKey = err.keyValue ? Object.keys(err.keyValue)[0] : null;
            if (dupKey === 'name') {
                return res.status(409).json({ success: false, message: 'A space with this name already exists. Please choose a different name.' });
            } else if (dupKey === 'owner') {
                // This means there is a stray unique index preventing the owner from having multiple spaces
                return res.status(409).json({ success: false, message: 'You cannot create another space because of a database unique constraint on the owner field. The server will attempt to correct this; please try again shortly.' });
            }
            // Fallback message for other duplicate keys
            return res.status(409).json({ success: false, message: 'A duplicate key error occurred while creating the space.', details: err.keyValue });
        }
        res.status(500).json({ success: false, message: 'An internal server error occurred while creating the space.' });
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
            return res.redirect('/space');
        });
    }
    res.redirect('/space?error=Incorrect Password');
});

router.post('/upload-space/:spaceId', authMiddleware, uploadSpace.single('file'), async (req, res) => {
    try {
        const space = await spaceModel.findById(req.params.spaceId).populate('owner', 'username');
        if (!space) return res.status(404).json({ success: false, message: 'Space not found' });
        if (space.owner._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Only owners can upload' });
        }

        const newFile = await fileModel.create({
            s3Key: req.file.key,
            originalName: req.file.originalname,
            size: req.file.size,
            owner: req.user._id,
            isPublic: false,
            space: space._id,
            spaceName: space.name,
            spaceOwnerUsername: space.owner.username || req.user.username
        });
        
        await newFile.populate('owner', 'username');


        space.files.push(newFile._id);
        await space.save();

        res.status(201).json({ success: true, message: 'File uploaded successfully', file: newFile });
    } catch (err) {
        console.error('Upload to space error:', err);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
});

router.delete('/space/:spaceId', authMiddleware, async (req, res) => {
    try {
        const space = await spaceModel.findById(req.params.spaceId).populate('files');
        if (!space) {
            return res.status(404).json({ success: false, message: 'Space not found' });
        }

        const isOwner = space.owner.toString() === req.user._id.toString();
        const unlockedSpaces = (req.session && req.session.unlockedSpaces) ? req.session.unlockedSpaces : [];
        const isUnlocked = unlockedSpaces.includes(space._id.toString());

        if (!isOwner) {
            if (!space.allowDelete || !isUnlocked) {
                return res.status(403).json({ success: false, message: 'You are not authorized to delete this space' });
            }
        }

        // Delete all files from S3 and MongoDB
        for (const file of space.files) {
            try {
                await deleteFileFromS3(file.s3Key);
            } catch (e) {
                console.warn('Error deleting file from S3:', file.s3Key, e.message);
            }
            try {
                await fileModel.findByIdAndDelete(file._id);
            } catch (e) {
                console.warn('Error deleting file record from DB:', file._id, e.message);
            }
        }

        // Delete the space
        await spaceModel.findByIdAndDelete(req.params.spaceId);

        res.json({ success: true, message: 'Space deleted successfully' });
    } catch (err) {
        console.error('Error deleting space:', err);
        res.status(500).json({ success: false, message: 'Failed to delete space' });
    }
});

module.exports = router