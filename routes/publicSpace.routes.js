const express = require('express');
const router = express.Router();
const PublicSpace = require('../models/PublicSpace.model');
const authMiddleware = require('../middlewares/authe');
const counterModel = require('../models/Counter.model');
const { uploadPublicSpace } = require('../config/multer.config');
const { deleteFileFromS3 } = require('../services/storageService');
const fileModel = require('../models/File.model');
const archiver = require('archiver');
const { s3 } = require('../config/s3-config');

router.post('/create-public-space', authMiddleware, async (req, res) => {
    try {
        const { name, allowUploads, allowDownloads } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Space name is required' });
        }

        const existingSpace = await PublicSpace.findOne({ name });
        if (existingSpace) {
            return res.status(400).json({ success: false, message: 'Space name already exists. Please choose another.' });
        }

        const newSpace = await PublicSpace.create({
            name,
            owner: req.user._id,
            // This fix handles both boolean true/false and string "true"/"false"
            allowUploads: String(allowUploads) === 'true',
            allowDownloads: String(allowDownloads) === 'true'
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

        // Check if uploads are allowed (if restricted, only owner can upload)
        if ((space.allowUploads === false || space.allowUploads === 'false') && space.owner.toString() !== req.user._id.toString()) {
            await deleteFileFromS3(req.file.key).catch(err => console.error('Cleanup error:', err));
            return res.status(403).json({ success: false, message: 'Uploads are disabled for this space by the owner.' });
        }

        // 1. Create the file in the main files collection first
        const savedFile = await fileModel.create({
            originalName: req.file.originalname,
            s3Key: req.file.key,
            size: req.file.size,
            owner: req.user._id,
            isPublic: true,
            space: space._id
        });

        // 2. Create the embedded file object, using the SAME _id
        const newFile = {
            _id: savedFile._id, // Sync IDs
            originalName: req.file.originalname,
            s3Key: req.file.key,
            size: req.file.size,
            mimetype: req.file.mimetype,
            owner: req.user._id
        };

        space.files.push(newFile);
        await space.save();

        // Increment the file counter
        await counterModel.findOneAndUpdate(
            { name: 'totalFiles' },
            { $inc: { count: 1 } },
            { upsert: true, new: true }
        );

        // 3. Prepare response for frontend
        const addedFile = savedFile.toObject();
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

        // Strict ownership check or permission check
        if (!space.owner || space.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'You can only delete spaces you created.' });
        }

        if (space.files && space.files.length > 0) {
            const deletePromises = space.files.map(async file => {
                if (file.s3Key) {
                    await fileModel.findOneAndDelete({ s3Key: file.s3Key });
                    console.log(`[Delete Space] Deleting S3 Key: ${file.s3Key}`);
                    return deleteFileFromS3(file.s3Key).catch(err => console.error('S3 Delete Error:', err));
                }
            });
            await Promise.allSettled(deletePromises);
        }

        await PublicSpace.findByIdAndDelete(req.params.spaceId);

        res.json({ success: true, message: 'Space deleted successfully' });
    } catch (error) {
        console.error('Error deleting public space:', error);
        res.status(500).json({ success: false, message: 'Server error during deletion' });
    }
});

router.get('/get-public-spaces', authMiddleware, async (req, res) => {
    try {
        const spaces = await PublicSpace.find().populate('owner', 'username').populate('files.owner', 'username');
        res.json({ success: true, spaces });
    } catch (error) {
        console.error('Error fetching public spaces:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.delete('/delete-public-file/:spaceId/:fileId', authMiddleware, async (req, res) => {
    try {
        const { spaceId, fileId } = req.params;
        const space = await PublicSpace.findById(spaceId);

        if (!space) {
            return res.status(404).json({ success: false, message: 'Space not found' });
        }

        const fileIndex = space.files.findIndex(f => f._id.toString() === fileId);
        if (fileIndex === -1) {
            return res.status(404).json({ success: false, message: 'File not found in this space' });
        }

        // Allow deletion if user is Space Owner OR File Owner
        if (space.owner.toString() !== req.user._id.toString() && space.files[fileIndex].owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Unauthorized to delete this file' });
        }

        const fileToDelete = space.files[fileIndex];
        if (fileToDelete.s3Key) {
            await fileModel.findOneAndDelete({ s3Key: fileToDelete.s3Key });
            console.log(`[Delete File] Deleting S3 Key: ${fileToDelete.s3Key}`);
            await deleteFileFromS3(fileToDelete.s3Key).catch(err => console.error('S3 Delete Error:', err));
        }

        space.files.splice(fileIndex, 1);
        await space.save();

        res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error deleting public file:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

const { GetObjectCommand } = require('@aws-sdk/client-s3');

router.get('/download-public-space-all/:spaceId', authMiddleware, async (req, res) => {
    try {
        const space = await PublicSpace.findById(req.params.spaceId);
        if (!space) {
            return res.status(404).send('Space not found');
        }

        if ((space.allowDownloads === false || space.allowDownloads === 'false') && space.owner.toString() !== req.user._id.toString()) {
            return res.status(403).send('Downloads are disabled for this space.');
        }

        const archive = archiver('zip', { zlib: { level: 9 } });

        // Handle archive errors
        archive.on('error', (err) => {
            console.error('Archiver error:', err);
            if (!res.headersSent) {
                res.status(500).send({ error: err.message });
            } else {
                res.end();
            }
        });

        // Handle warnings
        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.warn('Archiver warning:', err);
            } else {
                console.error('Archiver error:', err);
            }
        });

        const safeName = (space.name || 'download').replace(/[^a-zA-Z0-9-_ ]/g, '_');
        res.attachment(`${safeName}.zip`);
        archive.pipe(res);

        let appendedCount = 0;
        for (const file of space.files) {
            if (!file.s3Key) continue;
            try {
                // Check existence first to provide clearer info
                let exists = true;
                try {
                    const head = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: file.s3Key });
                    await s3.send(head);
                } catch (hErr) {
                    exists = false;
                }

                if (!exists) {
                    archive.append(Buffer.from(`File not available on S3: ${file.originalName}`), { name: `ERROR_${file.originalName}.txt` });
                    continue;
                }

                const cmd = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: file.s3Key });
                const data = await s3.send(cmd);

                // data.Body should be a stream in Node.js - append to archive
                archive.append(data.Body, { name: file.originalName });
                appendedCount++;
            } catch (err) {
                console.error(`Failed to append file ${file.originalName} (${file.s3Key}) to archive:`, err);
                archive.append(Buffer.from(`Error downloading file: ${err.message}`), { name: `ERROR_${file.originalName}.txt` });
            }
        }

        if (appendedCount === 0) {
            archive.append(Buffer.from('No files could be downloaded for this space. Either there are no files or the files are not available on S3.'), { name: 'INFO.txt' });
        }

        await archive.finalize();
    } catch (error) {
        console.error('Error downloading space:', error);
        if (!res.headersSent) {
            res.status(500).send('Server Error');
        } else {
            res.end();
        }
    }
});

module.exports = router;