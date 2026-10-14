const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserAccess = require('../models/UserAccess');
const Bundle = require('../models/Bundle');

exports.protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch (err) { res.status(401).json({ error: 'Invalid or expired token' }); }
};

exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

exports.checkAccess = async (req, res, next) => {
  try {
    const Product = require('../models/Product');
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.isFree) { req.product = product; return next(); }
    const email = req.user.email;
    const direct = await UserAccess.findOne({ email, productId: product._id, isActive: true, expiresAt: { $gt: new Date() } });
    if (direct) { req.product = product; return next(); }
    const bundles = await Bundle.find({ products: product._id });
    if (bundles.length) {
      const ba = await UserAccess.findOne({ email, bundleId: { $in: bundles.map(b => b._id) }, isActive: true, expiresAt: { $gt: new Date() } });
      if (ba) { req.product = product; return next(); }
    }
    return res.status(403).json({ error: 'No active access to this product', code: 'NO_ACCESS' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.requireJournalAccess = async (req, res, next) => {
  try {
    const JournalSubscription = require('../models/JournalSubscription');
    const sub = await JournalSubscription.findOne({
      email: req.user.email, isActive: true, expiresAt: { $gt: new Date() }
    }).sort('-expiresAt');
    if (!sub) return res.status(403).json({ error: 'Active Trading Journal subscription required', code: 'NO_JOURNAL_ACCESS' });
    req.journalSub = sub;
    next();
  } catch (err) { res.status(500).json({ error: err.message }); }
};

