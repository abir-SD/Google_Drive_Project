const express = require('express')
const userRouter = require('./routes/user-routes')
const app = express()

const dotenv = require('dotenv')
dotenv.config()


const connectToDB = require('./config/db')

const cookieParser = require('cookie-parser')

// Start server only after DB connects so we can display a clean console (only two lines)
connectToDB().then(() => {
    // Start listening after DB is connected. We print both lines here (DB connect already printed 'connected to db')
    app.listen(3000, () => {
        console.log('listening on port 3000')
    });
}).catch(err => {
    // If DB connection failed, exit to avoid starting server in bad state
    console.error('Failed to start server due to DB connection failure');
    process.exit(1);
});

// Note: removed previous immediate listen call to avoid duplicate logs



const indexRouter = require('./routes/index.routes')
const publicSpaceRouter = require('./routes/publicSpace.routes')
app.set('view engine', 'ejs')
app.use(express.static('assets'))
app.use(cookieParser())
const session = require('express-session')
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))






app.use('/', indexRouter)
app.use('/', publicSpaceRouter)

// It will hit /user/test
app.use('/user', userRouter)


process.on('uncaughtException', err => {
    console.log('Uncaught Exception ! Please try again ...')
})

app.listen(3000, () => {
    console.log('listening on port 3000')

})