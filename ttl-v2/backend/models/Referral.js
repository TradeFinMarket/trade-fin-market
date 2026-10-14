const mongoose = require('mongoose');
const referralSchema = new mongoose.Schema({
  referrerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  referrerEmail: { type: String, required: true },
  referralCode:  { type: String, required: true, unique: true },
  referredEmail: { type: String },
  referredId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status:        { type: String, enum: ['pending','converted'], default: 'pending' },
  commissionPct: { type: Number, default: 10 }, // 10% commission
  orderId:       { type: String },
  orderAmount:   { type: Number, default: 0 }, // in paise
  commissionAmt: { type: Number, default: 0 }, // in paise
  isPaid:        { type: Boolean, default: false },
  paidAt:        { type: Date },
  createdAt:     { type: Date, default: Date.now },
  convertedAt:   { type: Date }
});
module.exports = mongoose.model('Referral', referralSchema);
