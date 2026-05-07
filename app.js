const express = require('express')
const path = require('path') // 1. ADDED THIS: Needed for folder paths
const userRouter = require('./routes/user-routes')
const app = express()

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

app.set('trust proxy', 1);

// Passport and DB Config
const passport = require('passport')
require('./config/passport')
const connectToDB = require('./config/db')
const cookieParser = require('cookie-parser')

// Connect to Database (will connect asynchronously, app can still handle requests)
connectToDB().catch(err => {
    console.error('Failed to connect to database:', err.message);
    // App will still run but may fail on routes that need DB
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
        httpOnly: true 
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

// Handle 404s (Optional but good)
app.use((req, res) => {
    res.status(404).render('404'); // Make sure you have a 404.ejs file
});

process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
})

module.exports = app;
// final vercel build test