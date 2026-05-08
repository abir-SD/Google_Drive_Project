const express = require('express')
const path = require('path') // 1. ADDED THIS: Needed for folder paths
const userRouter = require('./routes/user-routes')
const app = express()

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

app.set('trust proxy', 1);

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
        secure: true, // Vercel is always HTTPS, so we can set this to true
        httpOnly: true,
        sameSite: 'Strict', // CSRF protection
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
app.use((req, res, next) => {
    // Skip this check for health endpoint and static files
    if (req.path === '/api/health' || req.path.startsWith('/assets')) {
        return next();
    }
    
    // If DB not connected yet, try to connect again
    if (!dbConnected) {
        console.warn('⚠️ Database not connected yet, attempting to reconnect...');
        connectToDB()
            .then(() => {
                dbConnected = true;
                console.log('✅ Database reconnected');
                next();
            })
            .catch(err => {
                console.error('❌ Database still not connected:', err.message);
                // Let request proceed but it may fail
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

// Handle 404s (Optional but good)
app.use((req, res) => {
    res.status(404).render('404'); // Make sure you have a 404.ejs file
});

process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
})

module.exports = app;
// final vercel build test