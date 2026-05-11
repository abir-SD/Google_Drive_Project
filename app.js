const express = require('express')
const path = require('path') // 1. ADDED THIS: Needed for folder paths
const userRouter = require('./routes/user-routes')
const app = express()

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

// ✅ CRITICAL: Check for required environment variables
const requiredEnvVars = ['JWT_SECRET', 'DB_CONNECTION_STRING'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('❌ CRITICAL: Missing environment variables:', missingEnvVars.join(', '));
    console.error('⚠️ Application may fail. Please set these environment variables.');
}

app.set('trust proxy', 1);

// Force HTTPS in production (Vercel)
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        const protocol = req.get('x-forwarded-proto');
        // Only redirect if we're sure it's HTTP
        if (protocol && protocol !== 'https') {
            return res.redirect(301, `https://${req.get('host')}${req.url}`);
        }
        next();
    });
}

// Cache-busting headers to force browser to fetch fresh content
app.use((req, res, next) => {
    // Force no caching of HTML to get latest headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Security Headers - Protect against common attacks (WITHOUT CSP)
app.use((req, res, next) => {
    // Prevent clickjacking attacks
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Feature Policy / Permissions Policy
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Explicitly remove CSP if it exists
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    
    next();
});

// Passport and DB Config

// Passport and DB Config
const passport = require('passport')
require('./config/passport')
const connectToDB = require('./config/db')
const cookieParser = require('cookie-parser')

// Track database connection status
let dbConnected = false;

// Try to connect to database immediately
connectToDB()
    .then(() => {
        dbConnected = true;
        console.log('✅ Database connected successfully on app startup');
    })
    .catch(err => {
        console.error('❌ Failed to connect to database on startup:', err.message);
        console.error('⚠️ App will still run, but database queries may fail');
    });

// 2. PATH CONFIGURATION: Tells Vercel exactly where your folders are
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views')) // IMPORTANT for Vercel
app.use(express.static(path.join(__dirname, 'assets'))) // Use path.join here too

app.use(cookieParser())

const session = require('express-session')
 app.use(session({
     secret: process.env.SESSION_SECRET || 'dev_secret',
     resave: false,
     saveUninitialized: false,
     cookie: { 
         secure: process.env.NODE_ENV === 'production', // Only require HTTPS in production
         httpOnly: true,
         sameSite: 'Lax', // Changed from Strict to Lax to allow OAuth redirects
         maxAge: 1000 * 60 * 60 * 24 // 24 hours
     }
 }))

// Increase payload size limit to 50MB to support large file uploads
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Initialize passport AFTER express-session
app.use(passport.initialize())
app.use(passport.session())

// Global middleware to make user data available to all views
const jwt = require('jsonwebtoken')
const userModel = require('./models/user.model')

app.use(async (req, res, next) => {
    const token = req.cookies.token;
    res.locals.user = null;
    
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const foundUser = await userModel.findById(decoded.userId).select('-password');
            if (foundUser) {
                res.locals.user = foundUser;
            }
        } catch (error) {
            // Token is invalid or expired
        }
    }
    next();
});

// Middleware to ensure database is ready before handling requests
let dbConnectionAttempts = 0;
const MAX_DB_ATTEMPTS = 2;

app.use((req, res, next) => {
    // Skip this check for health endpoint and static files
    if (req.path === '/api/health' || req.path.startsWith('/assets')) {
        return next();
    }
    
    // If DB not connected, only try a couple times then proceed
    if (!dbConnected && dbConnectionAttempts < MAX_DB_ATTEMPTS) {
        dbConnectionAttempts++;
        console.warn(`⚠️ Database not connected yet (attempt ${dbConnectionAttempts}/${MAX_DB_ATTEMPTS})...`);
        connectToDB()
            .then(() => {
                dbConnected = true;
                dbConnectionAttempts = 0;
                console.log('✅ Database reconnected');
                next();
            })
            .catch(err => {
                console.error('❌ Database connection failed:', err.message);
                // Still proceed so page doesn't hang
                next();
            });
    } else {
        next();
    }
});

// Routes
const authRouter = require('./routes/auth.routes');
const indexRouter = require('./routes/index.routes')
const publicSpaceRouter = require('./routes/publicSpace.routes')
const homeRouter = require('./routes/home.routes')
const globalRouter = require('./routes/global.routes')
const spaceRouter = require('./routes/space.routes')

app.use('/', authRouter);
app.use('/', homeRouter)
app.use('/', globalRouter)
app.use('/', spaceRouter)
app.use('/', indexRouter)
app.use('/', publicSpaceRouter)
app.use('/user', userRouter)

// Health check endpoint (Vercel needs this)
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle 404s with error handling
app.use((req, res, next) => {
    try {
        res.status(404).render('404');
    } catch (err) {
        console.error('Error rendering 404 page:', err);
        res.status(404).send('<h1>404 - Page Not Found</h1><p><a href="/welcome">Go to Home</a></p>');
    }
});

// Global error handler (must be last middleware)
app.use((err, req, res, next) => {
    console.error('❌ Global error handler triggered');
    console.error('Path:', req.path);
    console.error('Method:', req.method);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    // Only show detailed errors in development
    const errorMessage = process.env.NODE_ENV === 'production' 
        ? 'An error occurred' 
        : err.message;
    
    res.status(err.status || 500).send(`<h1>500 - Server Error</h1><p>${errorMessage}</p><p><a href="/welcome">Go to Home</a></p>`);
});

process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
})

// Only start listening for requests if we're not in production (for local development)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
// final vercel build test
