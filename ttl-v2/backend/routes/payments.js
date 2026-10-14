const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Product = require('../models/Product');
const Bundle = require('../models/Bundle');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const UserAccess = require('../models/UserAccess');
const User = require('../models/User');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const JournalSubscription = require('../models/JournalSubscription');
const { protect } = require('../middleware/auth');
const { sendPurchaseConfirmation } = require('../utils/email');

const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });

async function getItem(type, id) {
  if (type === 'product') { const p = await Product.findById(id); return { item: p, inr: p?.priceINR, usd: p?.priceUSD, days: p?.accessDurationDays||90 }; }
  if (type === 'journal') { const plan = await SubscriptionPlan.findOne({ tier: id, isActive: true }); return { item: plan, inr: plan?.priceINR, usd: plan?.priceUSD, days: plan?.durationDays||30 }; }
  const b = await Bundle.findById(id).populate('products'); return { item: b, inr: b?.priceINR, usd: b?.priceUSD, days: b?.accessDurationDays||180 };
}

async function grantJournalSub(order) {
  const u = await User.findOne({ email: order.customerEmail });
  await JournalSubscription.create({
    email: order.customerEmail, userId: u?._id || null,
    tier: order.journalTier, source: order.type === 'bundle' ? 'bundle' : 'direct',
    sourceBundle: order.bundle || null,
    expiresAt: new Date(Date.now() + order.accessDurationDays * 864e5),
    isActive: true, orderId: order._id
  });
}

async function grantAccess(order, item) {
  const exp = new Date(Date.now() + order.accessDurationDays * 864e5);
  const u = await User.findOne({ email: order.customerEmail });
  const base = { email: order.customerEmail, userId: u?._id||null, orderId: order._id, expiresAt: exp, isActive: true };

  if (order.type === 'journal') {
    await grantJournalSub(order);
    return;
  }

  if (order.type === 'product') {
    await UserAccess.findOneAndUpdate({ email: order.customerEmail, productId: order.product }, { ...base, productId: order.product }, { upsert: true, new: true });
  } else {
    await UserAccess.findOneAndUpdate({ email: order.customerEmail, bundleId: order.bundle }, { ...base, bundleId: order.bundle }, { upsert: true, new: true });
    if (item?.products) for (const p of item.products) await UserAccess.findOneAndUpdate({ email: order.customerEmail, productId: p._id||p }, { ...base, productId: p._id||p }, { upsert: true, new: true });
    // Bundle may also include Trading Journal access
    if (item?.includesJournal && item.journalTier) {
      const u2 = await User.findOne({ email: order.customerEmail });
      const days = item.journalAccessDays || (item.journalTier==='monthly'?30:item.journalTier==='6month'?180:365);
      await JournalSubscription.create({
        email: order.customerEmail, userId: u2?._id||null, tier: item.journalTier,
        source: 'bundle', sourceBundle: item._id,
        expiresAt: new Date(Date.now() + days*864e5), isActive: true, orderId: order._id
      });
    }
  }
}

// CLAIM FREE
router.post('/claim-free', protect, async (req, res) => {
  try {
    const p = await Product.findById(req.body.productId);
    if (!p || !p.isFree) return res.status(400).json({ error: 'Not a free product' });
    const existing = await UserAccess.findOne({ email: req.user.email, productId: p._id, isActive: true, expiresAt: { $gt: new Date() } });
    if (existing) return res.json({ success: true, message: 'Already have access!' });
    const order = await Order.create({ customerName: req.user.name, customerEmail: req.user.email, userId: req.user._id, product: p._id, type:'product', currency:'INR', originalAmount:0, finalAmount:0, gateway:'free', status:'paid', accessDurationDays: p.accessDurationDays||90 });
    await grantAccess(order, p);
    await Product.findByIdAndUpdate(p._id, { $inc: { totalSales: 1 } });
    res.json({ success: true, message: 'Access granted!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// RAZORPAY CREATE  (type: 'product' | 'bundle' | 'journal' — for journal, itemId is the tier string)
router.post('/razorpay/create', protect, async (req, res) => {
  try {
    const { type, itemId, couponCode } = req.body;
    const { item, inr, days } = await getItem(type, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    let orig = inr, disc = 0, couponDoc = null;
    if (couponCode) {
      couponDoc = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (couponDoc) disc = couponDoc.discountType==='percent' ? Math.round(orig*couponDoc.discountValue/100) : Math.min(couponDoc.discountValue,orig);
    }
    const final = Math.max(orig-disc, 100);
    const rzpOrder = await rzp.orders.create({ amount: final, currency: 'INR', receipt: 'rcpt_'+Date.now() });
    const orderData = { customerName:req.user.name, customerEmail:req.user.email, userId:req.user._id, type, currency:'INR', originalAmount:orig, discountAmount:disc, finalAmount:final, couponCode:couponCode||null, coupon:couponDoc?._id||null, gateway:'razorpay', gatewayOrderId:rzpOrder.id, accessDurationDays:days };
    if (type === 'journal') orderData.journalTier = itemId; else orderData[type] = itemId;
    const order = await Order.create(orderData);
    res.json({ orderId: rzpOrder.id, orderDbId: order._id, amount: final, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID, name: req.user.name, email: req.user.email, itemTitle: item.title||item.name||item.label });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// RAZORPAY VERIFY
router.post('/razorpay/verify', protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderDbId } = req.body;
    const sig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(razorpay_order_id+'|'+razorpay_payment_id).digest('hex');
    if (sig !== razorpay_signature) return res.status(400).json({ error: 'Invalid payment signature' });
    const order = await Order.findById(orderDbId).populate('product').populate({ path:'bundle', populate:{ path:'products' } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.status='paid'; order.gatewayPaymentId=razorpay_payment_id; order.gatewaySignature=razorpay_signature;
    await order.save();
    if (order.coupon) await Coupon.findByIdAndUpdate(order.coupon, { $inc:{usedCount:1} });
    const item = order.product || order.bundle;
    if (item) await item.constructor.findByIdAndUpdate(item._id, { $inc:{totalSales:1} });
    await grantAccess(order, item);
    try { await sendPurchaseConfirmation({ order, item: item || { title: 'Trading Journal — ' + order.journalTier } }); } catch(e) {}
    res.json({ success: true, productId: order.product?._id, bundleId: order.bundle?._id, journalTier: order.journalTier });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// STRIPE CREATE
router.post('/stripe/create', protect, async (req, res) => {
  try {
    const { type, itemId, couponCode } = req.body;
    const { item, usd, days } = await getItem(type, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    let orig = usd, disc = 0, couponDoc = null;
    if (couponCode) {
      couponDoc = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (couponDoc) disc = couponDoc.discountType==='percent' ? Math.round(orig*couponDoc.discountValue/100) : Math.min(couponDoc.discountValue,orig);
    }
    const final = Math.max(orig-disc, 50);
    const pi = await stripe.paymentIntents.create({ amount: final, currency:'usd', metadata:{ type, itemId, email:req.user.email } });
    const orderData = { customerName:req.user.name, customerEmail:req.user.email, userId:req.user._id, type, currency:'USD', originalAmount:orig, discountAmount:disc, finalAmount:final, couponCode:couponCode||null, coupon:couponDoc?._id||null, gateway:'stripe', gatewayOrderId:pi.id, accessDurationDays:days };
    if (type === 'journal') orderData.journalTier = itemId; else orderData[type] = itemId;
    const order = await Order.create(orderData);
    res.json({ clientSecret: pi.client_secret, orderDbId: order._id, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// STRIPE WEBHOOK
router.post('/stripe/webhook', express.raw({ type:'application/json' }), async (req, res) => {
  try {
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const order = await Order.findOne({ gatewayOrderId: pi.id }).populate('product').populate({ path:'bundle', populate:{ path:'products' } });
      if (order && order.status !== 'paid') {
        order.status='paid'; order.gatewayPaymentId=pi.id; await order.save();
        const item = order.product || order.bundle;
        if (item) await item.constructor.findByIdAndUpdate(item._id, { $inc:{totalSales:1} });
        if (order.coupon) await Coupon.findByIdAndUpdate(order.coupon, { $inc:{usedCount:1} });
        await grantAccess(order, item);
        try { await sendPurchaseConfirmation({ order, item: item || { title: 'Trading Journal — ' + order.journalTier } }); } catch(e) {}
      }
    }
    res.json({ received: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
