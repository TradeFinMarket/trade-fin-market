const express = require('express');
const router = express.Router();
const JournalEntry = require('../models/JournalEntry');
const JournalSubscription = require('../models/JournalSubscription');
const { protect, requireJournalAccess, adminOnly } = require('../middleware/auth');

const MISTAKE_TAGS = [
  'Overtrading','Revenge Trading','FOMO Entry','No Stop Loss','Moved Stop Loss',
  'Oversized Position','Ignored Trading Plan','Traded During News',
  'Held Too Long','Exited Too Early','Averaged Down','Emotional Decision'
];

// ── ACCESS CHECK ────────────────────────────────────────────────────────────
router.get('/access', protect, async (req, res) => {
  try {
    const sub = await JournalSubscription.findOne({
      email: req.user.email, isActive: true, expiresAt: { $gt: new Date() }
    }).sort('-expiresAt');
    if (!sub) return res.json({ hasAccess: false });
    res.json({ hasAccess: true, tier: sub.tier, expiresAt: sub.expiresAt, source: sub.source });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/mistake-tags', (req, res) => res.json({ tags: MISTAKE_TAGS }));
router.get('/checklist-items', (req, res) => {
  res.json({
    items: [
      { key: 'followedPlan', label: 'Followed my trading plan' },
      { key: 'setStopLoss', label: 'Set stop loss before entering' },
      { key: 'correctPositionSize', label: 'Position size matched my risk rules' },
      { key: 'waitedConfirmation', label: 'Waited for full setup confirmation' },
      { key: 'didNotMoveStop', label: 'Did not move stop loss against position' },
      { key: 'noAveragingDown', label: 'Did not average down on a loser' },
      { key: 'stoppedAtLossLimit', label: 'Stopped trading after daily loss limit' },
      { key: 'noRevengeTrade', label: 'No revenge trade after a loss' },
      { key: 'noFomoEntry', label: 'No FOMO entry chasing price' },
      { key: 'followedExitPlan', label: 'Followed my exit plan / took target' },
    ]
  });
});

// ── ENTRIES CRUD ─────────────────────────────────────────────────────────────
router.post('/entries', protect, requireJournalAccess, async (req, res) => {
  try {
    const { date, market, instrument, direction, pnl, pnlPercent, checklist, mistakes, notes } = req.body;
    if (!date || !market || !instrument || pnl === undefined) return res.status(400).json({ error: 'date, market, instrument and pnl are required' });
    const entry = await JournalEntry.create({
      email: req.user.email, userId: req.user._id,
      date, market, instrument, direction: direction || 'long',
      pnl: parseFloat(pnl), pnlPercent: pnlPercent !== undefined ? parseFloat(pnlPercent) : null,
      checklist: checklist || {}, mistakes: mistakes || [], notes: notes || ''
    });
    res.status(201).json({ entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/entries', protect, requireJournalAccess, async (req, res) => {
  try {
    const { from, to, market, limit = 200 } = req.query;
    const filter = { email: req.user.email };
    if (from || to) filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
    if (market && market !== 'all') filter.market = market;
    const entries = await JournalEntry.find(filter).sort('-date').limit(parseInt(limit));
    res.json({ entries });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/entries/:id', protect, requireJournalAccess, async (req, res) => {
  try {
    const entry = await JournalEntry.findOne({ _id: req.params.id, email: req.user.email });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    const fields = ['date','market','instrument','direction','pnl','pnlPercent','checklist','mistakes','notes'];
    fields.forEach(f => { if (req.body[f] !== undefined) entry[f] = req.body[f]; });
    await entry.save();
    res.json({ entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/entries/:id', protect, requireJournalAccess, async (req, res) => {
  try {
    const entry = await JournalEntry.findOneAndDelete({ _id: req.params.id, email: req.user.email });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
function rangeFor(period) {
  const now = new Date();
  let start;
  if (period === 'week') { start = new Date(now); start.setDate(now.getDate() - 7); }
  else if (period === 'month') { start = new Date(now); start.setMonth(now.getMonth() - 1); }
  else if (period === 'year') { start = new Date(now); start.setFullYear(now.getFullYear() - 1); }
  else { start = new Date(0); }
  return { start, end: now };
}

router.get('/analytics', protect, requireJournalAccess, async (req, res) => {
  try {
    const period = req.query.period || 'month';
    const { start, end } = rangeFor(period);
    const entries = await JournalEntry.find({ email: req.user.email, date: { $gte: start, $lte: end } }).sort('date');

    const totalTrades = entries.length;
    const wins = entries.filter(e => e.pnl > 0).length;
    const losses = entries.filter(e => e.pnl < 0).length;
    const totalPnl = entries.reduce((s, e) => s + e.pnl, 0);
    const winRate = totalTrades ? Math.round((wins / totalTrades) * 100) : 0;
    const avgDiscipline = totalTrades ? Math.round(entries.reduce((s, e) => s + e.disciplineScore, 0) / totalTrades) : 0;
    const bestTrade = entries.reduce((m, e) => Math.max(m, e.pnl), -Infinity);
    const worstTrade = entries.reduce((m, e) => Math.min(m, e.pnl), Infinity);

    // Mistake frequency
    const mistakeCounts = {};
    entries.forEach(e => (e.mistakes || []).forEach(m => { mistakeCounts[m] = (mistakeCounts[m] || 0) + 1; }));
    const topMistakes = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count }));

    // Market breakdown
    const marketCounts = {};
    entries.forEach(e => { marketCounts[e.market] = (marketCounts[e.market] || 0) + 1; });

    // Daily P&L series (for chart)
    const dailyMap = {};
    entries.forEach(e => {
      const key = new Date(e.date).toISOString().substring(0, 10);
      dailyMap[key] = (dailyMap[key] || 0) + e.pnl;
    });
    const dailySeries = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0])).map(([date, pnl]) => ({ date, pnl }));

    // Discipline checklist item breakdown (how often each followed)
    const checklistItems = require("../models/JournalEntry").ALL_CL_KEYS;
    const checklistBreakdown = checklistItems.map(key => {
      const followed = entries.filter(e => e.checklist?.[key]).length;
      return { key, followedCount: followed, pct: totalTrades ? Math.round((followed / totalTrades) * 100) : 0 };
    });

    res.json({
      period, totalTrades, wins, losses, winRate, totalPnl, avgDiscipline,
      bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
      worstTrade: worstTrade === Infinity ? 0 : worstTrade,
      topMistakes, marketCounts, dailySeries, checklistBreakdown
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN: full visibility across all users ───────────────────────────────────
router.get('/admin/all-entries', protect, adminOnly, async (req, res) => {
  try {
    const { email, market, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (email) filter.email = new RegExp(email, 'i');
    if (market && market !== 'all') filter.market = market;
    const entries = await JournalEntry.find(filter).sort('-date').skip((page - 1) * limit).limit(parseInt(limit));
    const total = await JournalEntry.countDocuments(filter);
    res.json({ entries, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/platform-stats', protect, adminOnly, async (req, res) => {
  try {
    const [totalEntries, totalSubs, activeSubs, allEntries] = await Promise.all([
      JournalEntry.countDocuments(),
      JournalSubscription.countDocuments(),
      JournalSubscription.countDocuments({ isActive: true, expiresAt: { $gt: new Date() } }),
      JournalEntry.find().select('email pnl disciplineScore mistakes market')
    ]);
    const uniqueJournalers = new Set(allEntries.map(e => e.email)).size;
    const avgDiscipline = allEntries.length ? Math.round(allEntries.reduce((s, e) => s + e.disciplineScore, 0) / allEntries.length) : 0;
    const mistakeCounts = {};
    allEntries.forEach(e => (e.mistakes || []).forEach(m => { mistakeCounts[m] = (mistakeCounts[m] || 0) + 1; }));
    const topMistakesPlatform = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => ({ tag, count }));
    const marketCounts = {};
    allEntries.forEach(e => { marketCounts[e.market] = (marketCounts[e.market] || 0) + 1; });

    res.json({ totalEntries, totalSubs, activeSubs, uniqueJournalers, avgDiscipline, topMistakesPlatform, marketCounts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
