const { S3Client } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
    forcePathStyle: true,
    // Supabase S3 compatibility always uses us-east-1; allow override via AWS_REGION
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.SUPABASE_S3_ENDPOINT, // e.g. https://<project>.supabase.co/storage/v1/s3
    credentials: {
        accessKeyId: process.env.SUPABASE_ACCESS_KEY,
        secretAccessKey: process.env.SUPABASE_SECRET_KEY
    }
});

module.exports = { s3 };