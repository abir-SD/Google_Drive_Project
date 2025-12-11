const express = require('express')
const userRouter = require('./routes/user-routes')
const app = express()

const dotenv = require('dotenv')
dotenv.config()


const connectToDB = require('./config/db')
connectToDB()

const cookieParser = require('cookie-parser')



const indexRouter = require('./routes/index.routes')
app.set('view engine', 'ejs')
app.use(express.static('assets'))
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))






app.use('/', indexRouter)

// It will hit /user/test
app.use('/user', userRouter)


process.on('uncaughtException', err => {
    console.log('Uncaught Exception ! Please try again ...')
})

app.listen(3000, () => {
    console.log('listening on port 3000')

})