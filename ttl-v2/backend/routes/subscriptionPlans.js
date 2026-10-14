const express = require('express');
const router = express.Router();
const SubscriptionPlan = require('../models/SubscriptionPlan');
const JournalSubscription = require('../models/JournalSubscription');
const { protect, adminOnly } = require('../middleware/auth');

const DEFAULTS = [
  { tier: 'monthly', label: 'Monthly', durationDays: 30, priceINR: 59900, priceUSD: 999, originalPriceINR: 0, badge: '', sortOrder: 1,
    features: ['Unlimited journal entries','Daily discipline checklist','Weekly & monthly analytics','Mistake pattern tracking'] },
  { tier: '6month', label: '6 Months', durationDays: 180, priceINR: 299900, priceUSD: 3999, originalPriceINR: 359400, badge: 'Most Popular', sortOrder: 2,
    features: ['Everything in Monthly','Save vs monthly price','6-month trend analytics','Priority support'] },
  { tier: 'yearly', label: 'Yearly', durationDays: 365, priceINR: 499900, priceUSD: 5999, originalPriceINR: 718800, badge: 'Best Value', sortOrder: 3,
    features: ['Everything in 6 Months','Biggest savings','Full yearly performance review','Export your data anytime'] },
];

async function ensureDefaults() {
  const count = await SubscriptionPlan.countDocuments();
  if (count === 0) await SubscriptionPlan.insertMany(DEFAULTS);
}

// PUBLIC: list active plans
router.get('/plans', async (req, res) => {
  try {
    await ensureDefaults();
    const plans = await SubscriptionPlan.find({ isActive: true }).sort('sortOrder');
    res.json({ plans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN: list all plans (incl inactive)
router.get('/admin/plans', protect, adminOnly, async (req, res) => {
  try {
    await ensureDefaults();
    const plans = await SubscriptionPlan.find().sort('sortOrder');
    res.json({ plans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN: update a plan (price, features, badge, active status)
router.put('/admin/plans/:tier', protect, adminOnly, async (req, res) => {
  try {
    const { priceINR, priceUSD, originalPriceINR, label, badge, features, isActive, durationDays } = req.body;
    const update = {};
    if (priceINR !== undefined) update.priceINR = Math.round(parseFloat(priceINR) * 100);
    if (priceUSD !== undefined) update.priceUSD = Math.round(parseFloat(priceUSD) * 100);
    if (originalPriceINR !== undefined) update.originalPriceINR = Math.round(parseFloat(originalPriceINR) * 100);
    if (label !== undefined) update.label = label;
    if (badge !== undefined) update.badge = badge;
    if (features !== undefined) update.features = features;
    if (isActive !== undefined) update.isActive = isActive;
    if (durationDays !== undefined) update.durationDays = parseInt(durationDays);
    const plan = await SubscriptionPlan.findOneAndUpdate({ tier: req.params.tier }, update, { new: true, upsert: false });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN: all subscriptions (who has journal access)
router.get('/admin/subscriptions', protect, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status === 'active') filter.isActive = true, filter.expiresAt = { $gt: new Date() };
    if (status === 'expired') filter.expiresAt = { $lte: new Date() };
    const subs = await JournalSubscription.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit));
    const total = await JournalSubscription.countDocuments(filter);
    const activeCount = await JournalSubscription.countDocuments({ isActive: true, expiresAt: { $gt: new Date() } });
    res.json({ subscriptions: subs, total, activeCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN: manually grant or revoke journal access
router.post('/admin/grant', protect, adminOnly, async (req, res) => {
  try {
    const { email, tier, days } = req.body;
    if (!email || !tier) return res.status(400).json({ error: 'email and tier required' });
    const duration = days ? parseInt(days) : (tier === 'monthly' ? 30 : tier === '6month' ? 180 : 365);
    const sub = await JournalSubscription.create({
      email: email.toLowerCase(), tier, source: 'manual',
      expiresAt: new Date(Date.now() + duration * 86400000), isActive: true
    });
    res.status(201).json({ subscription: sub });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/revoke/:id', protect, adminOnly, async (req, res) => {
  try {
    await JournalSubscription.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Revoked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
