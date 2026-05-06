const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const userModel = require('../models/user.model.js')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')




router.get('/register', (req, res) => {
    res.render('register', { error: null }); // Pass null initially
});

router.post('/register',
    body('username').trim().isLength({ min: 3 }),
    body('email').trim().isEmail().isLength({ min: 13 }),
    body('password').trim().isLength({ min: 5 }),

    async (req, res) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.render('register', { error: "Please provide valid information (Check your email/password length)." });
        }

        const { username, email, password } = req.body;

        try {
            // 1. Check if username or email already exists
            const userByEmail = await userModel.findOne({ email });
            if (userByEmail) {
                return res.render('register', { error: "This email is already registered." });
            }

            const userByUsername = await userModel.findOne({ username });
            if (userByUsername) {
                return res.render('register', { error: "This username is already taken." });
            }

            // 2. Hash password if user doesn't exist
            const hashPassword = await bcrypt.hash(password, 10);

            // 3. Create user
            const newUser = await userModel.create({
                username,
                email,
                password: hashPassword
            });

            // 4. Generate Token
            const token = jwt.sign({
                userId: newUser._id,
                email: newUser.email,
                username: newUser.username
            }, process.env.JWT_SECRET);

            res.cookie('token', token);
            res.redirect('/home');

        } catch (error) {
            res.status(500).json({
                message: "Something went wrong man...",
                error: error.message
            });
        }
    }
);

router.get('/login', (req, res) => {
    res.render('login', { error: null }); // Pass null initially
});

router.post('/login',
    body('email').trim().isEmail().isLength({ min: 13 }),
    body('password').trim().isLength({ min: 5 }),
    async (req, res) => {
        const errors = validationResult(req);

        // 1. Handle Validation Errors
        if (!errors.isEmpty()) {
            return res.render('login', { error: "Invalid email or password format." });
        }

        const { email, password } = req.body;

        try {
            const user = await userModel.findOne({ email });

            // 2. Handle User Not Found
            if (!user) {
                return res.render('login', { error: "Email or Password is incorrect" });
            }

            const isMatch = await bcrypt.compare(password, user.password);

            // 3. Handle Password Mismatch
            if (!isMatch) {
                return res.render('login', { error: "Email or Password is incorrect" });
            }

            const token = jwt.sign({
                userId: user._id,
                email: user.email,
                username: user.username
            }, process.env.JWT_SECRET);

            res.cookie('token', token);
            res.redirect('/home');

        } catch (err) {
            // 4. Handle Server Errors
            res.render('login', { error: "Something went wrong. Please try again later." });
        }
    }
);


router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/welcome');
});

module.exports = router