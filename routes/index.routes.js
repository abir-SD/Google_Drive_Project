const express = require('express')
const authMiddleware = require('../middlewares/authe')
const { uploadFileToS3, getSignedDownloadUrl, getSignedViewUrl, deleteFileFromS3 } = require('../services/storageService')
const archiver = require('archiver');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../config/s3-config');
const userModel = require('../models/user.model');
const bcrypt = require('bcrypt');const counterModel = require('../models/Counter.model');
const router = express.Router()
const { upload, uploadSpace } = require('../config/multer.config')
const fileModel = require('../models/File.model')
const spaceModel = require('../models/Space.model');



// Root path - redirect to appropriate page
router.get('/', (req, res) => {
    if (req.user) {
        return res.redirect('/home');
    }
    res.redirect('/welcome');
});

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

// Home routes moved to routes/home.routes.js
// Space page routes moved to routes/space.routes.js

router.get('/members', async (req, res) => {
    try {
        console.log('📍 [/members] Starting request...');
        
        // Get 3 most recent users
        console.log('📍 [/members] Fetching recent users...');
        const recentUsers = await userModel.find({}, 'username email').sort({ createdAt: -1 }).limit(3);
        console.log('✅ [/members] Recent users fetched:', recentUsers.length);
        
        // Count total active members
        console.log('📍 [/members] Counting total users...');
        const totalUsers = await userModel.countDocuments();
        console.log('✅ [/members] Total users:', totalUsers);
        
        // Get total files from counter
        console.log('📍 [/members] Fetching file counter...');
        let totalFiles = 0;
        const fileCounter = await counterModel.findOne({ name: 'totalFiles' });
        if (fileCounter) {
            totalFiles = fileCounter.count;
        }
        console.log('✅ [/members] Total files:', totalFiles);

        console.log('📍 [/members] Rendering members page...');
        return res.render('members', {
            users: recentUsers,
            count: totalUsers,
            totalFiles: totalFiles,
            error: null
        });

    } catch (error) {
        console.error("❌ [/members] ERROR:", error.message);
        console.error("❌ [/members] Stack:", error.stack);
        return res.status(500).render('members', {
            users: [],
            count: 0,
            totalFiles: 0,
            error: error.message
        });
    }
});

// Personal upload moved to routes/home.routes.js


// Personal download/view moved to routes/home.routes.js


// Global hub routes moved to routes/global.routes.js


// Global public upload/view/download moved to routes/global.routes.js

// For deleting files




// NEW SPACE ROUTES
// create/unlock/upload/delete space routes moved to routes/space.routes.js

// File delete handler moved to routes/home.routes.js

// Space file view/download/zip routes moved to routes/space.routes.js

// Space file download/zip routes moved to routes/space.routes.js

// Space file download/zip routes moved to routes/space.routes.js


module.exports = router