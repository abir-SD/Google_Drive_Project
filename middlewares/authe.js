const jwt = require('jsonwebtoken')
const user = require('../models/user.model')


const auth = async (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.redirect('/user/login'); // Redirect instead of just rendering
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Find user and attach to request
        const foundUser = await user.findById(decoded.userId).select('-password');
        
        if (!foundUser) {
            res.clearCookie('token');
            return res.redirect('/welcome');
        }

        req.user = foundUser;
        return next();
    } catch (error) {
        // If token is expired or invalid, clear it and send them home
        res.clearCookie('token');
        return res.redirect('/welcome');
    }
};

module.exports = auth