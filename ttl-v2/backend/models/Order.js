const mongoose = require('mongoose');
const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true, default: () => 'TL-' + Date.now() },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true, lowercase: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  bundle: { type: mongoose.Schema.Types.ObjectId, ref: 'Bundle', default: null },
  journalTier: { type: String, enum: ['monthly','6month','yearly',''], default: '' },
  type: { type: String, enum: ['product','bundle','journal'], required: true },
  currency: { type: String, enum: ['INR','USD'], required: true },
  originalAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  finalAmount: { type: Number, default: 0 },
  couponCode: { type: String, default: null },
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  gateway: { type: String, enum: ['razorpay','stripe','free'], required: true },
  gatewayOrderId: { type: String, default: '' },
  gatewayPaymentId: { type: String, default: '' },
  gatewaySignature: { type: String, default: '' },
  status: { type: String, enum: ['pending','paid','failed','refunded'], default: 'pending' },
  accessDurationDays: { type: Number, default: 90 },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Order', orderSchema);
