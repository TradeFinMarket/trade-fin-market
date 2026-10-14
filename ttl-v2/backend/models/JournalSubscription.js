const mongoose = require('mongoose');

const journalSubscriptionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  tier: { type: String, enum: ['monthly','6month','yearly'], required: true },
  source: { type: String, enum: ['direct','bundle','manual'], default: 'direct' },
  sourceBundle: { type: mongoose.Schema.Types.ObjectId, ref: 'Bundle', default: null },

  startedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true },

  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('JournalSubscription', journalSubscriptionSchema);
