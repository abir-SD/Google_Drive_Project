const express = require('express');
const router = express.Router();
const PublicSpace = require('../models/PublicSpace.model');
const authMiddleware = require('../middlewares/authe');
const { uploadPublicSpace } = require('../config/multer.config');

router.post('/create-public-space', authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, message: 'Space name is required' });
        }

        const newSpace = await PublicSpace.create({
            name,
            owner: req.user._id
        });

        // Convert to object and append ownerUsername for the frontend to display immediately
        const spaceObj = newSpace.toObject();
        spaceObj.ownerUsername = req.user.username;

        res.json({ success: true, space: spaceObj, message: 'Public space created successfully' });
    } catch (error) {
        console.error('Error creating public space:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/upload-public-space/:spaceId', authMiddleware, uploadPublicSpace.single('file'), async (req, res) => {
    try {
        const space = await PublicSpace.findById(req.params.spaceId);
        if (!space) {
            return res.status(404).send('Space not found');
        }

        // Check if user is owner
        if (space.owner.toString() !== req.user._id.toString()) {
            return res.status(403).send('Unauthorized: Only the space owner can upload files here.');
        }

        const newFile = {
            originalName: req.file.originalname,
            s3Key: req.file.key,
            size: req.file.size,
            mimetype: req.file.mimetype,
            owner: req.user._id
        };

        space.files.push(newFile);
        await space.save();

        // Return the newly added file with owner info for the frontend
        const addedFile = space.files[space.files.length - 1].toObject();
        addedFile.owner = {
            _id: req.user._id,
            username: req.user.username
        };

        res.json({ success: true, message: 'File uploaded successfully', file: addedFile });
    } catch (error) {
        console.error('Error uploading to public space:', error);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
});

router.delete('/delete-public-space/:spaceId', authMiddleware, async (req, res) => {
    try {
        const space = await PublicSpace.findById(req.params.spaceId);
        
        if (!space) {
            return res.status(404).json({ success: false, message: 'Space not found' });
        }

        // Strict ownership check
        if (space.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'You can only delete spaces you created.' });
        }

        // Note: S3 file deletion is temporarily disabled to prevent crashes if storageService is missing.
        // if (space.files && space.files.length > 0) {
        //     const deletePromises = space.files.map(file => {
        //         if (file.s3Key) return deleteFileFromS3(file.s3Key);
        //     });
        //     await Promise.allSettled(deletePromises);
        // }

        await PublicSpace.findByIdAndDelete(req.params.spaceId);

        res.json({ success: true, message: 'Space deleted successfully' });
    } catch (error) {
        console.error('Error deleting public space:', error);
        res.status(500).json({ success: false, message: 'Server error during deletion' });
    }
});

module.exports = router;