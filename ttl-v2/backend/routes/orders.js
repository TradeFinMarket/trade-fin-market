const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const UserAccess = require('../models/UserAccess');
const JournalSubscription = require('../models/JournalSubscription');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { status, page=1, limit=25 } = req.query;
    const filter = {}; if (status) filter.status = status;
    const orders = await Order.find(filter).populate('product','title').populate('bundle','name').sort('-createdAt').skip((page-1)*limit).limit(+limit);
    res.json({ orders, total: await Order.countDocuments(filter) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', protect, adminOnly, async (req, res) => {
  try {
    const [total, paid, rINR, rUSD, activeAcc, journalRevINR, activeJournalSubs] = await Promise.all([
      Order.countDocuments(), Order.countDocuments({ status:'paid' }),
      Order.aggregate([{$match:{status:'paid',currency:'INR'}},{$group:{_id:null,t:{$sum:'$finalAmount'}}}]),
      Order.aggregate([{$match:{status:'paid',currency:'USD'}},{$group:{_id:null,t:{$sum:'$finalAmount'}}}]),
      UserAccess.countDocuments({ isActive:true, expiresAt:{$gt:new Date()} }),
      Order.aggregate([{$match:{status:'paid',type:'journal',currency:'INR'}},{$group:{_id:null,t:{$sum:'$finalAmount'}}}]),
      JournalSubscription.countDocuments({ isActive:true, expiresAt:{$gt:new Date()} })
    ]);
    const trend = await Order.aggregate([
      {$match:{status:'paid',createdAt:{$gte:new Date(Date.now()-30*864e5)}}},
      {$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$createdAt'}},count:{$sum:1},rev:{$sum:'$finalAmount'}}},
      {$sort:{_id:1}}
    ]);
    res.json({ total, paid, revINR:(rINR[0]?.t||0)/100, revUSD:(rUSD[0]?.t||0)/100, activeAccess:activeAcc, journalRevINR:(journalRevINR[0]?.t||0)/100, activeJournalSubs, trend });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
