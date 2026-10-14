// bundles.js
const express = require('express');
const router = express.Router();
const Bundle = require('../models/Bundle');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const b = await Bundle.find({ isActive: true }).populate('products','title category level priceINR isFree badge').sort('-isHighlighted createdAt');
    res.json({ bundles: b });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try { res.json({ bundles: await Bundle.find().populate('products','title').sort('-createdAt') }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/', protect, adminOnly, async (req, res) => {
  try { res.status(201).json({ bundle: await Bundle.create(req.body) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/:id', protect, adminOnly, async (req, res) => {
  try { res.json({ bundle: await Bundle.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('products','title') }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try { await Bundle.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
