const multer = require('multer')
const awsStorage = require('multer-s3')
const { s3 } = require('../config/s3-config')

const storage = awsStorage({
    s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: awsStorage.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
        const userId = req.user._id
        const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')
        const s3Key = `${userId}/${Date.now()}_${safeFileName}`
        cb(null, s3Key); 
    }

})

const upload = multer({
    storage
})

module.exports = upload;

