const jwt = require('jsonwebtoken')
const user = require('../models/user.model')


const auth = async (req, res, next) => {
    const token = req.cookies.token

    if (!token) {
        // return res.status(401).json({
        //     message: "Unauthorized"
        // })
        res.render('login')
        return
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        // req.user = decoded
        req.user = await user.findById(decoded.userId).select('-password')
    }
    catch (error) {
        return res.status(401).json({
            message: "Unauthorized"
        })
    }

    return next()

}

module.exports = auth