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
const spaceModel = require('../models/Space.model');



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