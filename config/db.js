const mongoose = require('mongoose')

const connectToDB = () => {
    mongoose.connect(process.env.DB_CONNECTION_STRING).then(() => {
        console.log('connected to db')
    }).catch(err => console.log(err))
}

module.exports = connectToDB