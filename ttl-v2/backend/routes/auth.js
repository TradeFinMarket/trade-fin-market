const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const OTP = require('../models/OTP');
const UserAccess = require('../models/UserAccess');
const Bundle = require('../models/Bundle');
const { protect } = require('../middleware/auth');

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });

function genOTP() { return String(Math.floor(100000 + Math.random() * 900000)); }

async function sendOTPEmail(email, otp, name = '') {
  const { transporter, FROM } = require('../utils/email');
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Your OTP — Trafinmarket',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border:1px solid #E2E8F0;border-radius:12px">
        <div style="font-family:'Georgia',serif;font-size:22px;color:#1D4ED8;letter-spacing:2px;margin-bottom:6px">TRAFINMARKET</div>
        <div style="font-size:11px;color:#64748B;letter-spacing:3px;text-transform:uppercase;margin-bottom:28px">Verification</div>
        <p style="font-size:14px;color:#0A0A0A;margin-bottom:6px">Hi${name?' '+name:''},</p>
        <p style="font-size:13px;color:#64748B;line-height:1.8;margin-bottom:24px">Your one-time verification code is:</p>
        <div style="background:#EFF6FF;border:2px solid #1D4ED8;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
          <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#1D4ED8">${otp}</div>
          <div style="font-size:11px;color:#64748B;margin-top:6px">Valid for 10 minutes only</div>
        </div>
        <p style="font-size:12px;color:#94A3B8;line-height:1.7">If you did not request this, please ignore this email. Do not share this OTP with anyone.</p>
      </div>`
  });
}

// ─── SEND OTP (step 1 of registration) ───────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { email, purpose = 'register' } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    if (purpose === 'register') {
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) return res.status(400).json({ error: 'Email already registered. Please sign in.' });
    }

    // Rate limit: max 3 OTPs per email per 15 mins
    const recent = await OTP.countDocuments({ email: email.toLowerCase(), createdAt: { $gte: new Date(Date.now() - 15*60000) } });
    if (recent >= 3) return res.status(429).json({ error: 'Too many OTP requests. Please wait 15 minutes.' });

    // Invalidate old OTPs
    await OTP.updateMany({ email: email.toLowerCase(), used: false }, { used: true });

    const otp = genOTP();
    await OTP.create({ email: email.toLowerCase(), otp, purpose, expiresAt: new Date(Date.now() + 10*60000) });

    try {
      await sendOTPEmail(email, otp, req.body.name || '');
    } catch(e) {
      console.error('OTP email error:', e.message);
      // In dev mode: log OTP so developer can test without email
      if (process.env.NODE_ENV !== 'production') {
        console.log(`\n  ╔══════════════════════════════╗`);
        console.log(`  ║  DEV OTP for ${email}`);
        console.log(`  ║  OTP: ${otp}`);
        console.log(`  ╚══════════════════════════════╝\n`);
        // Still succeed in dev — OTP is in console
        return res.json({ success: true, message: 'DEV MODE: OTP logged to server console (no email sent)', devOtp: otp });
      }
      // In production: give clear instructions
      return res.status(500).json({
        error: 'Could not send OTP email. Please set up SMTP in Vercel:\n1. Go to Vercel → Settings → Environment Variables\n2. Add SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=your@gmail.com\n3. For SMTP_PASS: Go to myaccount.google.com → Security → App Passwords → Generate\n4. Redeploy after adding variables.'
      });
    }

    res.json({ success: true, message: 'OTP sent to ' + email });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── REGISTER (step 2 — verify OTP then create account) ──────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, otp } = req.body;
    if (!name || !email || !password || !phone || !otp)
      return res.status(400).json({ error: 'Name, email, phone, password and OTP are all required.' });

    if (phone.replace(/\D/g,'').length < 10)
      return res.status(400).json({ error: 'Please enter a valid 10-digit phone number.' });

    // Verify OTP
    const otpDoc = await OTP.findOne({ email: email.toLowerCase(), used: false, purpose: 'register' }).sort('-createdAt');
    if (!otpDoc) return res.status(400).json({ error: 'No OTP found. Please request a new OTP.' });
    if (otpDoc.expiresAt < new Date()) return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    if (otpDoc.otp !== otp.trim()) return res.status(400).json({ error: 'Incorrect OTP. Please check and try again.' });

    // Check duplicate again
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ error: 'Email already registered. Please sign in.' });

    // Mark OTP used
    otpDoc.used = true;
    await otpDoc.save();

    const user = await User.create({ name, email, password, phone, isVerified: true });

    try { const { sendWelcome } = require('../utils/email'); await sendWelcome({ name, email }); } catch(e) {}

    res.status(201).json({
      token: sign(user._id),
      user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone }
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Invalid email or password.' });
    res.json({ token: sign(user._id), user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── ME ───────────────────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const accesses = await UserAccess.find({ email: req.user.email, isActive: true, expiresAt: { $gt: new Date() } });
    res.json({ user: req.user, accesses });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always return success even if user not found (security)
    if (!user) return res.json({ success: true, message: 'If this email exists, an OTP has been sent.' });

    // Rate limit
    const recent = await OTP.countDocuments({ email: email.toLowerCase(), purpose: 'reset', createdAt: { $gte: new Date(Date.now() - 15*60000) } });
    if (recent >= 3) return res.status(429).json({ error: 'Too many requests. Please wait 15 minutes.' });

    await OTP.updateMany({ email: email.toLowerCase(), purpose: 'reset', used: false }, { used: true });
    const otp = genOTP();
    await OTP.create({ email: email.toLowerCase(), otp, purpose: 'reset', expiresAt: new Date(Date.now() + 10*60000) });

    try {
      const { transporter, FROM } = require('../utils/email');
      await transporter.sendMail({
        from: FROM,
        to: email,
        subject: 'Reset Your Password — Trafinmarket',
        html: `
          <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border:1px solid #E2E8F0;border-radius:12px">
            <div style="font-family:Georgia,serif;font-size:22px;color:#1D4ED8;letter-spacing:2px;margin-bottom:6px">TRAFINMARKET</div>
            <div style="font-size:11px;color:#64748B;letter-spacing:3px;text-transform:uppercase;margin-bottom:28px">Password Reset</div>
            <p style="font-size:14px;color:#0A0A0A;margin-bottom:8px">Hi ${user.name},</p>
            <p style="font-size:13px;color:#64748B;line-height:1.8;margin-bottom:24px">Your password reset OTP:</p>
            <div style="background:#EFF6FF;border:2px solid #1D4ED8;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
              <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#1D4ED8">${otp}</div>
              <div style="font-size:11px;color:#64748B;margin-top:6px">Valid for 10 minutes only</div>
            </div>
            <p style="font-size:12px;color:#94A3B8">If you did not request a password reset, ignore this email.</p>
          </div>`
      });
    } catch(e) {
      if (process.env.NODE_ENV !== 'production') console.log(`RESET OTP for ${email}: ${otp}`);
      else return res.status(500).json({ error: 'Could not send email. Please check SMTP settings in Vercel.' });
    }

    res.json({ success: true, message: 'OTP sent to ' + email });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Email, OTP and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const otpDoc = await OTP.findOne({ email: email.toLowerCase(), used: false, purpose: 'reset' }).sort('-createdAt');
    if (!otpDoc) return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    if (otpDoc.expiresAt < new Date()) return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    if (otpDoc.otp !== otp.trim()) return res.status(400).json({ error: 'Incorrect OTP. Please check and try again.' });

    otpDoc.used = true;
    await otpDoc.save();

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── MY LIBRARY ───────────────────────────────────────────────────────────────
router.get('/my-library', protect, async (req, res) => {
  try {
    const accesses = await UserAccess.find({ email: req.user.email, isActive: true, expiresAt: { $gt: new Date() } });
    const productIds = accesses.filter(a => a.productId).map(a => a.productId.toString());
    const bundleIds  = accesses.filter(a => a.bundleId).map(a => a.bundleId.toString());
    if (bundleIds.length) {
      const bundles = await Bundle.find({ _id: { $in: bundleIds } }).populate('products','_id');
      bundles.forEach(b => b.products.forEach(p => { const id = p._id.toString(); if (!productIds.includes(id)) productIds.push(id); }));
    }
    const expiryMap = {};
    accesses.forEach(a => { if (a.productId) expiryMap[a.productId.toString()] = a.expiresAt; });
    res.json({ productIds, bundleIds, expiryMap });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── ADMIN — all users ────────────────────────────────────────────────────────
router.get('/admin/users', protect, require('../middleware/auth').adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: 'customer' }).select('-password').sort('-createdAt');
    const accesses = await UserAccess.find({ isActive: true, expiresAt: { $gt: new Date() } });
    const accessMap = {};
    accesses.forEach(a => { if (!accessMap[a.email]) accessMap[a.email] = 0; accessMap[a.email]++; });
    res.json({ users, accessMap });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
