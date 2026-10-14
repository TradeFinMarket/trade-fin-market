const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const { protect, adminOnly } = require('../middleware/auth');

router.post('/validate', async (req, res) => {
  try {
    const { code, amount } = req.body;
    const c = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!c) return res.status(404).json({ valid: false, error: 'Coupon not found' });
    if (c.validUntil && new Date() > c.validUntil) return res.status(400).json({ valid: false, error: 'Coupon has expired' });
    if (c.maxUsesTotal && c.usedCount >= c.maxUsesTotal) return res.status(400).json({ valid: false, error: 'Usage limit reached' });
    const disc = c.discountType === 'percent' ? Math.round(amount * c.discountValue / 100) : Math.min(c.discountValue, amount);
    res.json({ valid: true, coupon: { code: c.code, discountType: c.discountType, discountValue: c.discountValue, discountAmount: disc } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/', protect, adminOnly, async (req, res) => {
  try { res.json({ coupons: await Coupon.find().sort('-createdAt') }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/', protect, adminOnly, async (req, res) => {
  try { res.status(201).json({ coupon: await Coupon.create(req.body) }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/:id', protect, adminOnly, async (req, res) => {
  try { res.json({ coupon: await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try { await Coupon.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); } catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
