const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const Referral = require('../models/Referral');
const User     = require('../models/User');
const Order    = require('../models/Order');
const { protect, adminOnly } = require('../middleware/auth');

// Generate unique 8-char referral code
function genCode(email) {
  return crypto.createHash('md5').update(email + Date.now()).digest('hex').substring(0, 8).toUpperCase();
}

// GET: my referral info + stats
router.get('/my', protect, async (req, res) => {
  try {
    let referral = await Referral.findOne({ referrerId: req.user._id, status: 'pending', referredId: { $exists: false } }).sort('-createdAt');
    // Create a referral record with code if user doesn't have one
    if (!referral || !referral.referralCode) {
      const code = genCode(req.user.email);
      referral = await Referral.create({ referrerId: req.user._id, referrerEmail: req.user.email, referralCode: code });
    }
    // Stats
    const conversions = await Referral.find({ referrerId: req.user._id, status: 'converted' });
    const totalEarned = conversions.reduce((s, r) => s + r.commissionAmt, 0);
    const totalPaid   = conversions.filter(r => r.isPaid).reduce((s, r) => s + r.commissionAmt, 0);
    const pending     = totalEarned - totalPaid;
    res.json({
      referralCode: referral.referralCode,
      referralLink: `${process.env.FRONTEND_URL || 'https://trafinmarket.in'}?ref=${referral.referralCode}`,
      stats: { totalReferrals: conversions.length, totalEarned, totalPaid, pendingPayout: pending },
      conversions: conversions.slice(0, 10).map(r => ({
        referredEmail: r.referredEmail, orderAmount: r.orderAmount,
        commissionAmt: r.commissionAmt, isPaid: r.isPaid, convertedAt: r.convertedAt
      }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST: track referral click (called when visitor lands with ?ref=CODE)
router.post('/track', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.json({ ok: false });
    const ref = await Referral.findOne({ referralCode: code });
    if (!ref) return res.json({ ok: false, error: 'Invalid referral code' });
    res.json({ ok: true, referrerId: ref.referrerId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST: convert referral after purchase (called internally by payments route)
router.post('/convert', async (req, res) => {
  try {
    const { referralCode, referredEmail, referredId, orderId, orderAmount } = req.body;
    const ref = await Referral.findOne({ referralCode });
    if (!ref) return res.json({ ok: false });
    // Don't allow self-referral
    if (ref.referrerEmail === referredEmail) return res.json({ ok: false, reason: 'self_referral' });
    const commissionAmt = Math.round(orderAmount * ref.commissionPct / 100);
    await Referral.create({
      referrerId: ref.referrerId, referrerEmail: ref.referrerEmail,
      referralCode, referredEmail, referredId,
      orderId, orderAmount, commissionAmt,
      status: 'converted', convertedAt: new Date()
    });
    res.json({ ok: true, commissionAmt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: all referrals
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const refs = await Referral.find({ status: 'converted' }).sort('-convertedAt').limit(100);
    const totalCommission = refs.reduce((s, r) => s + r.commissionAmt, 0);
    const unpaid = refs.filter(r => !r.isPaid).reduce((s, r) => s + r.commissionAmt, 0);
    res.json({ referrals: refs, totalCommission, unpaid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: mark commission as paid
router.post('/admin/pay/:id', protect, adminOnly, async (req, res) => {
  try {
    const ref = await Referral.findByIdAndUpdate(req.params.id, { isPaid: true, paidAt: new Date() }, { new: true });
    res.json({ ok: true, ref });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
