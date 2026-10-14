const mongoose = require('mongoose');
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  description: { type: String, default: '' },
  discountType: { type: String, enum: ['percent','flat'], required: true },
  discountValue: { type: Number, required: true },
  maxUsesTotal: { type: Number, default: null },
  usedCount: { type: Number, default: 0 },
  validUntil: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Coupon', couponSchema);
