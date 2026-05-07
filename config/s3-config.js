const { S3Client } = require("@aws-sdk/client-s3");

// Log S3 config for debugging
console.log('[S3 Config] AWS_REGION:', process.env.AWS_REGION);
console.log('[S3 Config] SUPABASE_S3_ENDPOINT:', process.env.SUPABASE_S3_ENDPOINT ? 'SET' : 'NOT SET');
console.log('[S3 Config] AWS_S3_BUCKET:', process.env.AWS_S3_BUCKET || 'NOT SET ⚠️');
console.log('[S3 Config] SUPABASE_ACCESS_KEY:', process.env.SUPABASE_ACCESS_KEY ? 'SET' : 'NOT SET');
console.log('[S3 Config] SUPABASE_SECRET_KEY:', process.env.SUPABASE_SECRET_KEY ? 'SET' : 'NOT SET');

if (!process.env.AWS_S3_BUCKET) {
    console.error('❌ CRITICAL: AWS_S3_BUCKET is not set! Uploads will fail.');
}

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