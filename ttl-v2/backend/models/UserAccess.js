const mongoose = require('mongoose');
const userAccessSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  bundleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bundle', default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  expiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  pagesViewed: { type: Number, default: 0 },
  lastAccessed: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('UserAccess', userAccessSchema);
