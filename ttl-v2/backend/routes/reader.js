const express    = require('express');
const router     = express.Router();
const path       = require('path');
const fs         = require('fs');
const { protect } = require('../middleware/auth');
const UserAccess  = require('../models/UserAccess');
const Product     = require('../models/Product');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');

// ─── CHECK ACCESS ─────────────────────────────────────────────────────────────
router.get('/:id/check', protect, async (req, res) => {
  try {
    const access = await UserAccess.findOne({
      email: req.user.email, productId: req.params.id,
      isActive: true, expiresAt: { $gt: new Date() }
    });
    if (!access) return res.status(403).json({ hasAccess: false, error: 'No active access.' });
    res.json({ hasAccess: true, expiresAt: access.expiresAt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── PRODUCT INFO ─────────────────────────────────────────────────────────────
router.get('/:id/info', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('title author category level pages');
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json({ product });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── MAIN: serve PDF ──────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    // 1. Check access
    const access = await UserAccess.findOne({
      email: req.user.email, productId: req.params.id,
      isActive: true, expiresAt: { $gt: new Date() }
    });
    if (!access) return res.status(403).json({ error: 'Access required. Purchase this PDF first.' });

    // 2. Get product
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // 3a. Serve from Railway disk (PRIMARY — most reliable)
    if (product.localPath) {
      const filePath = product.localPath;
      if (fs.existsSync(filePath)) {
        console.log('[READER] Serving from disk:', filePath);
        const stat = fs.statSync(filePath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', 'inline; filename="' + (product.fileName || 'document.pdf') + '"');
        res.setHeader('Cache-Control', 'no-store, no-cache, private');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        return fs.createReadStream(filePath).pipe(res);
      }
      console.log('[READER] Disk file missing:', filePath, '— trying Cloudinary');
    }

    // 3b. Serve from Cloudinary (FALLBACK)
    if (product.cloudUrl) {
      console.log('[READER] Serving from Cloudinary:', product.cloudUrl.substring(0, 60));
      const https = require('https');
      const http  = require('http');
      const client = product.cloudUrl.startsWith('https') ? https : http;

      return client.get(product.cloudUrl, (upstream) => {
        console.log('[READER] Cloudinary status:', upstream.statusCode);
        if (upstream.statusCode !== 200) {
          return res.status(502).json({
            error: 'Cannot fetch PDF from Cloudinary (status ' + upstream.statusCode + '). Please re-upload from admin.'
          });
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'no-store, no-cache, private');
        upstream.pipe(res);
      }).on('error', (err) => {
        res.status(500).json({ error: 'Stream error: ' + err.message });
      });
    }

    // 4. Nothing found
    return res.status(404).json({
      error: 'PDF not found. Please re-upload this PDF from the admin panel.',
      localPath: product.localPath || null,
      cloudUrl: product.cloudUrl || null
    });

  } catch(e) {
    console.error('[READER] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN: set cloudUrl manually ─────────────────────────────────────────────
router.post('/:id/set-cloud-url', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { cloudUrl, cloudPublicId } = req.body;
    if (!cloudUrl) return res.status(400).json({ error: 'cloudUrl required' });
    const match = cloudUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^/.]+)?$/);
    const pid   = cloudPublicId || (match ? match[1] : '');
    const updated = await Product.findByIdAndUpdate(req.params.id, { cloudUrl, cloudPublicId: pid }, { new: true });
    res.json({ success: true, cloudUrl: updated.cloudUrl, cloudPublicId: updated.cloudPublicId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
