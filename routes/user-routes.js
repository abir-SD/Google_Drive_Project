const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator')
const userModel = require('../models/user.model.js')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')




router.get('/register', (req, res) => {
    res.render('register')
})

router.post('/register',


    body('username').trim().isLength({ min: 3 }),
    body('email').trim().isEmail().isLength({ min: 13 }),
    body('password').trim().isLength({ min: 5 }),

    async (req, res) => {

        const errors = validationResult(req)

        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array(),
                message: "Invalid data man ..."
            })
        }
        else {
            const { username, email, password } = req.body
            const hashPassword = await bcrypt.hash(password, 10)
            try {
                const newUser = await userModel.create({
                    username,
                    email,
                    password: hashPassword
                })

                const token = jwt.sign({
                    userId: newUser._id,
                    email: newUser.email,
                    username: newUser.username
                },
                    process.env.JWT_SECRET
                )

                res.cookie('token', token)
                res.redirect('/home')

            } catch (error) {
                res.status(500).json({
                    message: "Something went wrong man...",
                    error: error.array()
                })
            }
        }
    })

router.get('/login', (req, res) => {
    res.render('login')
})

router.post('/login',

    body('email').trim().isEmail().isLength({ min: 13 }),
    body('password').trim().isLength({ min: 5 }),

    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: errors.array(),
                message: "Invalid data man ..."
            })
        }
        else {
            const { email, password } = req.body

            const user = await userModel.findOne({
                email: email
            })

            if (!user) {
                return res.status(400).json({
                    message: "Email or Password is incorrect"
                })
            }

            const isMatch = await bcrypt.compare(password, user.password)

            if (!isMatch) {
                return res.status(400).json({
                    message: "Email or Password is incorrect"
                })
            }

            const token = jwt.sign({
                userId: user._id,
                email: user.email,
                username: user.username
            },
                process.env.JWT_SECRET
            )

            res.cookie('token', token)

            res.redirect('/home')

        }
    }
)

router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});

module.exports = router