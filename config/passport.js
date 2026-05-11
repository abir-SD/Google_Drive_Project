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
            // Extract email from Google profile
            const email = profile.emails && profile.emails[0] && profile.emails[0].value;
            if (!email) {
                console.error('❌ No email found in Google profile:', profile);
                return done(new Error('No email found in Google profile'));
            }

            console.log('🔍 Processing Google auth for email:', email);

            // Check if user already exists
            let user = await User.findOne({ email });

            if (!user) {
                // Create new user from Google profile
                const username = profile.displayName 
                    ? profile.displayName.toLowerCase().replace(/\s+/g, '_')
                    : (email && email.split('@')[0]) || 'google_user_' + Date.now();
                
                console.log('👤 Creating new user:', username, email);
                
                user = await User.create({
                    username,
                    email,
                    password: null, // No password for OAuth users
                    googleid: profile.id
                });
                
                console.log('✅ New user created:', user._id, user.email);
            } else {
                // Update existing user with Google ID if not present
                if (!user.googleid) {
                    user.googleid = profile.id;
                    await user.save();
                    console.log('✅ Updated existing user with Google ID:', user._id);
                }
            }

            return done(null, user);
        } catch (err) {
            console.error('❌ Passport Google Strategy Error:', err.message);
            console.error('Stack:', err.stack);
            return done(err);
        }
    }
));

passport.serializeUser((user, done) => {
    console.log('🔐 Serializing user:', user._id);
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        console.log('🔑 Deserializing user:', id);
        const u = await User.findById(id);
        if (!u) {
            console.error('❌ User not found during deserialization:', id);
            return done(new Error('User not found'));
        }
        done(null, u);
    } catch (e) {
        console.error('❌ Error deserializing user:', e.message);
        done(e);
    }
});
