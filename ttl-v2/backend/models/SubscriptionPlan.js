const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  tier: { type: String, enum: ['monthly','6month','yearly'], required: true, unique: true },
  label: { type: String, required: true },           // "Monthly", "6 Months", "Yearly"
  durationDays: { type: Number, required: true },     // 30, 180, 365
  priceINR: { type: Number, required: true },         // in paise
  priceUSD: { type: Number, required: true },         // in cents
  originalPriceINR: { type: Number, default: 0 },     // for showing strike-through savings
  badge: { type: String, default: '' },               // "Best Value", "Most Popular"
  features: [{ type: String }],
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

subscriptionPlanSchema.pre('save', function(next) { this.updatedAt = Date.now(); next(); });

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
