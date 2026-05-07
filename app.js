const express = require('express')
const userRouter = require('./routes/user-routes')
const app = express()

const dotenv = require('dotenv')
dotenv.config()

// Passport will be initialized after session middleware further below
const passport = require('passport')
require('./config/passport')

const connectToDB = require('./config/db')

const cookieParser = require('cookie-parser')

// Add this near the top where you require your DB config
connectToDB();

// Note: removed previous immediate listen call to avoid duplicate logs



const indexRouter = require('./routes/index.routes')
const publicSpaceRouter = require('./routes/publicSpace.routes')
const homeRouter = require('./routes/home.routes')
const globalRouter = require('./routes/global.routes')
const spaceRouter = require('./routes/space.routes')
app.set('view engine', 'ejs')
app.use(express.static('assets'))
app.use(cookieParser())
const session = require('express-session')
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true when live, false on localhost
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
            // Token is invalid or expired, user will be null
        }
    }
    next();
});

const authRouter = require('./routes/auth.routes');
app.use('/', authRouter);






app.use('/', homeRouter)
app.use('/', globalRouter)
app.use('/', spaceRouter)
app.use('/', indexRouter)
app.use('/', publicSpaceRouter)

// It will hit /user/test
app.use('/user', userRouter)


process.on('uncaughtException', err => {
    console.log('Uncaught Exception ! Please try again ...')
})
module.exports = app;