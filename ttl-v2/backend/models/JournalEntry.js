const mongoose = require('mongoose');

const ALL_CL_KEYS = [
  // Pre-trade
  'analyzedChart','checkedNews','identifiedSR','hadClearPlan','setRiskAmount','marketTrendConfirmed',
  // Execution
  'followedPlan','setStopLoss','correctPositionSize','waitedConfirmation','enteredAtRightLevel','noFomoEntry',
  // Post-trade
  'didNotMoveStop','noAveragingDown','stoppedAtLossLimit','noRevengeTrade','followedExitPlan',
  'reviewedTrade','acceptedLossGain','noOvertrading'
];

const checklistDef = {};
ALL_CL_KEYS.forEach(k => { checklistDef[k] = { type: Boolean, default: false }; });

const journalEntrySchema = new mongoose.Schema({
  email:    { type: String, required: true, lowercase: true, index: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Core trade info
  date:        { type: Date, required: true },
  market:      { type: String, enum: ['share','forex','crypto','options','futures','other'], required: true },
  instrument:  { type: String, required: true },
  direction:   { type: String, enum: ['long','short'], default: 'long' },
  tradeType:   { type: String, enum: ['intraday','swing','positional','scalp',''], default: '' },
  timeframe:   { type: String, default: '' },
  setup:       { type: String, default: '' },

  // Prices
  entryPrice:  { type: Number, default: null },
  exitPrice:   { type: Number, default: null },
  stopLoss:    { type: Number, default: null },
  target:      { type: Number, default: null },
  capitalUsed: { type: Number, default: null },

  // P&L
  pnl:         { type: Number, required: true },
  pnlPercent:  { type: Number, default: null },

  // Rating & confidence
  rating:      { type: Number, min: 0, max: 5, default: 0 },
  confidence:  { type: Number, min: 1, max: 10, default: 5 },

  // Mood (pre and post trade)
  preMood:     { type: String, enum: ['calm','fear','greed','conf','anx','frust','excited','bored',''], default: '' },
  postMood:    { type: String, enum: ['calm','fear','greed','conf','anx','frust','excited','bored',''], default: '' },

  // 20-point checklist (pre + exec + post)
  checklist: checklistDef,

  // Mistakes & learning
  mistakes:    [{ type: String }],
  notes:       { type: String, default: '' },
  learning:    { type: String, default: '' },
  improvement: { type: String, default: '' },

  // Auto-computed
  disciplineScore: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-compute discipline score before save
journalEntrySchema.pre('save', function(next) {
  const c = this.checklist || {};
  const total = ALL_CL_KEYS.length;
  const checked = ALL_CL_KEYS.filter(k => c[k]).length;
  this.disciplineScore = Math.round((checked / total) * 100);
  this.updatedAt = Date.now();
  next();
});

journalEntrySchema.statics.ALL_CL_KEYS = ALL_CL_KEYS;
module.exports = mongoose.model('JournalEntry', journalEntrySchema);
