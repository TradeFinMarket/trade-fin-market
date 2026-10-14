const mongoose = require('mongoose');
const bundleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  category: { type: String, enum: ['share','forex','crypto','mixed'], default: 'mixed' },
  priceINR: { type: Number, required: true },
  priceUSD: { type: Number, required: true },
  originalPriceINR: { type: Number, default: 0 },
  accessDurationDays: { type: Number, default: 180 },
  badge: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  isHighlighted: { type: Boolean, default: false },
  totalSales: { type: Number, default: 0 },
  includesJournal: { type: Boolean, default: false },
  journalTier: { type: String, enum: ['monthly','6month','yearly',''], default: '' },
  journalAccessDays: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Bundle', bundleSchema);
