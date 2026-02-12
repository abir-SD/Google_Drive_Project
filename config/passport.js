const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user.model');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails && profile.emails[0] && profile.emails[0].value;
            if (!email) return done(new Error('No email found in Google profile'));

            let user = await User.findOne({ email });

            if (!user) {
                user = await User.create({
                    username: profile.displayName || (email && email.split('@')[0]) || 'google_user',
                    email,
                    password: null,
                    googleid: profile.id
                });
            } else {
                if (!user.googleid) {
                    user.googleid = profile.id;
                    await user.save();
                }
            }

            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }
));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
    try {
        const u = await User.findById(id);
        done(null, u);
    } catch (e) { done(e); }
});
