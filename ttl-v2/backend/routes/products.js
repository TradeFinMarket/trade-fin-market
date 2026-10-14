const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const Product  = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

// ─── STORAGE CONFIG ────────────────────────────────────────────────────────────
// Railway: set UPLOAD_DIR=/app/uploads (where your volume is mounted)
// Local dev: uses ./backend/uploads automatically
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('[STORAGE] Created upload dir:', UPLOAD_DIR);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── UPLOAD HELPER ─────────────────────────────────────────────────────────────
// Tries Cloudinary first, falls back to Railway disk volume
async function handleUpload(file, folder) {
  if (!file || !file.buffer) return {};
  console.log('[UPLOAD] handleUpload:', file.originalname, file.buffer.length, 'bytes');

  // Try Cloudinary if configured
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key:    process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });
      const slug = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, public_id: slug, resource_type: 'raw', overwrite: true },
          (err, r) => err ? reject(err) : resolve(r)
        );
        stream.end(file.buffer);
      });
      console.log('[UPLOAD] Cloudinary OK:', result.secure_url);
      return { cloudUrl: result.secure_url, publicId: result.public_id, fileName: file.originalname, fileSize: file.buffer.length };
    } catch(e) {
      console.log('[UPLOAD] Cloudinary failed, using disk:', e.message);
    }
  }

  // Fallback: Railway Volume disk
  const slug = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
  const filePath = path.join(UPLOAD_DIR, slug);
  fs.writeFileSync(filePath, file.buffer);
  console.log('[UPLOAD] Saved to disk:', filePath);
  return { localPath: filePath, fileName: file.originalname, fileSize: file.buffer.length };
}

async function handleCoverUpload(file) {
  if (!file || !file.buffer) return null;
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: 'tfm-covers', resource_type: 'image' }, (err, r) => err ? reject(err) : resolve(r)).end(file.buffer);
      });
      return result.secure_url;
    } catch(e) { console.log('[UPLOAD] Cover Cloudinary failed:', e.message); }
  }
  const slug = 'cover-' + Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
  const filePath = path.join(UPLOAD_DIR, slug);
  fs.writeFileSync(filePath, file.buffer);
  return '/api/uploads/' + slug;
}

// ─── SERVE UPLOADS (local/Railway disk) ────────────────────────────────────────
router.get('/file/:filename', protect, (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(filePath).pipe(res);
});

// ─── PUBLIC: homepage featured products ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isActive: { $ne: false }, showOnHomepage: { $ne: false } };
    if (category && category !== 'all') filter.category = category;
    const products = await Product.find(filter).sort('sortOrder -createdAt').select('-localPath -fileUrl');
    res.json({ products, total: products.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: all active products (library page, quiz)
router.get('/all-active', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isActive: { $ne: false } };
    if (category && category !== 'all') filter.category = category;
    const products = await Product.find(filter).sort('sortOrder -createdAt').select('-localPath -fileUrl');
    res.json({ products, total: products.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: test cloudinary connection
router.get('/admin/test-cloudinary', protect, adminOnly, async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) return res.json({ ok: false, error: 'Cloudinary not configured', vars: { cloudName: false, apiKey: false, apiSecret: false } });
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
    const result = await cloudinary.api.ping();
    res.json({ ok: true, status: result.status, cloudName: process.env.CLOUDINARY_CLOUD_NAME });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ADMIN: fix all products active
router.post('/admin/fix-active', protect, adminOnly, async (req, res) => {
  try {
    await Product.updateMany({}, { isActive: true });
    const total = await Product.countDocuments();
    res.json({ ok: true, active: total, total });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: single product info
router.get('/:id/info', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('title author category level pages');
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json({ product });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: get all products
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const products = await Product.find().sort('-createdAt');
    res.json({ products, total: products.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: create product
router.post('/', protect, adminOnly, upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  try {
    const body = { ...req.body };
    if (!req.files?.pdf?.[0]) return res.status(400).json({ error: 'PDF file is required' });

    const up = await handleUpload(req.files.pdf[0], 'tfm-pdfs');
    console.log('[CREATE] Upload result:', { cloudUrl: up.cloudUrl||null, localPath: up.localPath||null, error: up.uploadError||null });
    if (up.uploadError) return res.status(500).json({ error: 'Upload failed: ' + up.uploadError });
    if (up.cloudUrl)    { body.cloudUrl = up.cloudUrl; body.cloudPublicId = up.publicId; }
    if (up.localPath)   body.localPath = up.localPath;
    if (up.fileName)    body.fileName = up.fileName;
    if (up.fileSize)    body.fileSize = up.fileSize;

    if (req.files?.cover?.[0]) {
      const coverUrl = await handleCoverUpload(req.files.cover[0]);
      if (coverUrl) body.coverImage = coverUrl;
    }

    // Type conversions
    if (body.priceINR)  body.priceINR  = Math.round(parseFloat(body.priceINR)  * 100);
    if (body.priceUSD)  body.priceUSD  = Math.round(parseFloat(body.priceUSD)  * 100);
    if (body.isFree !== undefined)        body.isFree        = body.isFree === 'true'  || body.isFree === true;
    if (body.isActive !== undefined)      body.isActive      = body.isActive !== 'false' && body.isActive !== false;
    if (body.showOnHomepage !== undefined) body.showOnHomepage = body.showOnHomepage === 'true' || body.showOnHomepage === true;
    if (body.tags && typeof body.tags === 'string') body.tags = body.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (body.whatYouLearn && typeof body.whatYouLearn === 'string') body.whatYouLearn = body.whatYouLearn.split('\n').map(t => t.trim()).filter(Boolean);
    if (body.accessDurationDays) body.accessDurationDays = parseInt(body.accessDurationDays);
    if (body.pages)     body.pages = parseInt(body.pages);
    if (body.sortOrder) body.sortOrder = parseInt(body.sortOrder);

    const product = await Product.create(body);
    console.log('[CREATE] Product created:', product._id, '| cloudUrl:', product.cloudUrl||'null', '| localPath:', product.localPath||'null');
    res.status(201).json({ product });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: update product
router.put('/:id', protect, adminOnly, upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  try {
    const body = { ...req.body };

    if (req.files?.pdf?.[0]) {
      const up = await handleUpload(req.files.pdf[0], 'tfm-pdfs');
      console.log('[UPDATE] Upload result:', { cloudUrl: up.cloudUrl||null, localPath: up.localPath||null, error: up.uploadError||null });
      if (up.uploadError) return res.status(500).json({ error: 'Upload failed: ' + up.uploadError });
      if (up.cloudUrl)  { body.cloudUrl = up.cloudUrl; body.cloudPublicId = up.publicId; }
      if (up.localPath) body.localPath = up.localPath;
      if (up.fileName)  body.fileName = up.fileName;
      if (up.fileSize)  body.fileSize = up.fileSize;
    }

    if (req.files?.cover?.[0]) {
      const coverUrl = await handleCoverUpload(req.files.cover[0]);
      if (coverUrl) body.coverImage = coverUrl;
    }

    if (body.priceINR)  body.priceINR  = Math.round(parseFloat(body.priceINR)  * 100);
    if (body.priceUSD)  body.priceUSD  = Math.round(parseFloat(body.priceUSD)  * 100);
    if (body.isFree !== undefined)        body.isFree        = body.isFree === 'true'  || body.isFree === true;
    if (body.isActive !== undefined)      body.isActive      = body.isActive !== 'false' && body.isActive !== false;
    if (body.showOnHomepage !== undefined) body.showOnHomepage = body.showOnHomepage === 'true' || body.showOnHomepage === true;
    if (body.tags && typeof body.tags === 'string') body.tags = body.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (body.whatYouLearn && typeof body.whatYouLearn === 'string') body.whatYouLearn = body.whatYouLearn.split('\n').map(t => t.trim()).filter(Boolean);
    if (body.accessDurationDays) body.accessDurationDays = parseInt(body.accessDurationDays);
    if (body.pages)     body.pages = parseInt(body.pages);
    if (body.sortOrder) body.sortOrder = parseInt(body.sortOrder);

    const updated = await Product.findByIdAndUpdate(req.params.id, body, { new: true });
    console.log('[UPDATE] Product saved:', req.params.id, '| cloudUrl:', updated?.cloudUrl||'null', '| localPath:', updated?.localPath||'null');
    res.json({ product: updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: delete product
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    // Delete local file if exists
    if (product.localPath && fs.existsSync(product.localPath)) {
      fs.unlinkSync(product.localPath);
    }
    await Product.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
