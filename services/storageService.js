const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { s3 } = require('../config/s3-config.js')




// For uploading data ...

const uploadFileToS3 = async (fileBuffer, originalName, MimeType, folder) => {
    const fileKey = `${folder}/${Date.now()}-${originalName}`
    const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: MimeType
    })

    try {
        await s3.send(command)
        const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`
        return { s3Key: fileKey, url: fileUrl }

    }
    catch (err) {
        console.error("S3 Upload Error:", err)
        throw new Error("Failed to upload file to S3")
    }


}
const uploadFileToS3ForUser = async (fileBuffer, originalName, MimeType, folder) => {
    const fileKey = `${folder}/${Date.now()}-${originalName}`
    const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: MimeType
    })

    try {
        await s3.send(command)
        const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`
        return { s3Key: fileKey, url: fileUrl }

    }
    catch (err) {
        console.error("S3 Upload Error:", err)
        throw new Error("Failed to upload file to S3")
    }


}

// For getting data ...

const getSignedDownloadUrl = async (s3Key, filename) => {
    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${filename}"`
    })
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })
    return signedUrl

}


const getSignedViewUrl = async (s3Key, filename) => {
    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        ResponseContentDisposition: `inline; filename="${filename}"`
    })
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })
    return signedUrl
}


// For deleting data ...

const deleteFileFromS3 = async (s3Key) => {
    const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key
    })

    try {
        await s3.send(command)
        return { success: true }
    }
    catch (err) {
        console.error("S3 Deletion Error:", err)
        throw new Error("Failed to delete file from S3")
    }
}





module.exports = { uploadFileToS3, getSignedDownloadUrl, deleteFileFromS3, getSignedViewUrl, uploadFileToS3ForUser };