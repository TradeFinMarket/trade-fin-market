require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');

// ── RATE LIMITING ──────────────────────────────────────────────────────────────
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: 'Too many attempts. Try again in 15 minutes.' }, standardHeaders: true, legacyHeaders: false });
const apiLimiter  = rateLimit({ windowMs: 1*60*1000,  max: 100, message: { error: 'Too many requests.' }, standardHeaders: true, legacyHeaders: false });

const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: true, // Allow all origins — tighten after testing
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// ── BODY PARSERS ──────────────────────────────────────────────────────────────
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── STATIC FILES ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));

// ── MONGODB CONNECTION ────────────────────────────────────────────────────────
// Use global cache so the connection is shared across all Vercel invocations
// The middleware MUST be registered before API routes so it runs first
if (!global._mongoCache) {
  global._mongoCache = { conn: null, promise: null };
}

// DO NOT set bufferCommands false globally — it causes immediate failures
// mongoose.set('bufferCommands', false)  <-- NEVER do this on Vercel

async function connectDB() {
  const cache = global._mongoCache;

  // Already connected
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in environment variables');
  }

  // If a connect is already in progress, share the same promise
  // This prevents race condition when 3 requests hit simultaneously
  if (!cache.promise) {
    console.log('[DB] Connecting...');
    cache.promise = mongoose
      .connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 60000,
        connectTimeoutMS: 30000,
        maxPoolSize: 5,
      })
      .then((m) => {
        console.log('[DB] Connected');
        cache.conn = m;
        cache.promise = null;
        return m;
      })
      .catch((err) => {
        console.error('[DB] Failed:', err.message);
        cache.promise = null;
        cache.conn = null;
        throw err;
      });
  } else {
    console.log('[DB] Waiting for existing connection...');
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

// ── DB MIDDLEWARE — MUST BE BEFORE ALL API ROUTES ────────────────────────────
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[DB] Middleware error:', err.message);
    res.status(503).json({
      error: 'Could not connect to database. Please try again in a few seconds.',
      detail: err.message,
      code: 'DB_ERROR'
    });
  }
});

// ── API ROUTES — after DB middleware ─────────────────────────────────────────
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/products', apiLimiter, require('./routes/products'));
app.use('/api/bundles', apiLimiter, require('./routes/bundles'));
app.use('/api/coupons', apiLimiter, require('./routes/coupons'));
app.use('/api/payments', apiLimiter, require('./routes/payments'));
app.use('/api/orders', apiLimiter, require('./routes/orders'));
app.use('/api/reader', apiLimiter, require('./routes/reader'));
app.use('/api/journal', apiLimiter, require('./routes/journal'));
app.use('/api/subscriptions', apiLimiter, require('./routes/subscriptionPlans'));
app.use('/api/blog', apiLimiter, require('./routes/blog'));
app.use('/api/referral', apiLimiter, require('./routes/referral'));

// ── PAGE ROUTES ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', db: mongoose.connection.readyState, time: new Date() }));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(__dirname, '../frontend/robots.txt')));
app.get('/sitemap.xml', (req, res) => { res.setHeader('Content-Type','application/xml'); res.sendFile(path.join(__dirname, '../frontend/sitemap.xml')); });
app.get('/admin*', (req, res) => res.sendFile(path.join(__dirname, '../admin/index.html')));
app.get('/reader', (req, res) => res.sendFile(path.join(__dirname, '../frontend/reader.html')));
app.get('/journal', (req, res) => res.sendFile(path.join(__dirname, '../frontend/journal.html')));
app.get('/quiz', (req, res) => res.sendFile(path.join(__dirname, '../frontend/quiz.html')));
app.get('/library', (req, res) => res.sendFile(path.join(__dirname, '../frontend/library.html')));
app.get('/my-library', (req, res) => res.sendFile(path.join(__dirname, '../frontend/my-library.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dashboard.html')));
app.get('/subscribe', (req, res) => res.sendFile(path.join(__dirname, '../frontend/subscribe.html')));
app.get('/bundles', (req, res) => res.sendFile(path.join(__dirname, '../frontend/bundles.html')));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, '../frontend/blog.html')));
app.get('/blog/:slug', (req, res) => res.sendFile(path.join(__dirname, '../frontend/blog-post.html')));
app.get('/referral', (req, res) => res.sendFile(path.join(__dirname, '../frontend/referral.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// ── SEED + START ──────────────────────────────────────────────────────────────
async function seedAdmin() {
  const User = require('./models/User');
  const SubscriptionPlan = require('./models/SubscriptionPlan');

  // Create admin user if not exists
  if (!(await User.findOne({ email: process.env.ADMIN_EMAIL }))) {
    await User.create({
      name: 'Admin',
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
      phone: '0000000000',
      isVerified: true
    });
    console.log('[Seed] Admin created:', process.env.ADMIN_EMAIL);
  }

  // Create default subscription plans if none exist
  const planCount = await SubscriptionPlan.countDocuments();
  if (planCount === 0) {
    await SubscriptionPlan.insertMany([
      {
        tier: 'monthly', label: 'Monthly', durationDays: 30,
        priceINR: 59900, priceUSD: 999, originalPriceINR: 0, badge: '', sortOrder: 1,
        features: ['Unlimited journal entries', 'Daily discipline checklist', 'Weekly & monthly analytics', 'Mistake pattern tracking', 'Psychology analysis']
      },
      {
        tier: '6month', label: '6 Months', durationDays: 180,
        priceINR: 299900, priceUSD: 3999, originalPriceINR: 359400, badge: 'Most Popular', sortOrder: 2,
        features: ['Everything in Monthly', 'Save ₹60 vs monthly', '6-month trend analytics', 'Priority support', 'Greed & fear tracking']
      },
      {
        tier: 'yearly', label: 'Yearly', durationDays: 365,
        priceINR: 499900, priceUSD: 5999, originalPriceINR: 718800, badge: 'Best Value', sortOrder: 3,
        features: ['Everything in 6 Months', 'Biggest savings', 'Full yearly review', 'Export data anytime', 'All future features']
      },
    ]);
    console.log('[Seed] Subscription plans created');
  }
}

// Local dev: connect and start server
// ── RAILWAY: always start as real server ─────────────────────────────────────
// ── VERCEL:  use middleware pattern (no listen) ───────────────────────────────
const isRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;
const isVercel  = !!process.env.VERCEL;

if (!isVercel) {
  // Railway or local dev — start a real persistent server
  connectDB()
    .then(async () => {
      await seedAdmin();
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n  ╔══════════════════════════════════════╗`);
        console.log(`  ║   TRAFINMARKET  v2  ✦           ║`);
        console.log(`  ╠══════════════════════════════════════╣`);
        console.log(`  ║  Running on port: ${PORT}               ║`);
        console.log(`  ║  Platform: ${isRailway ? 'Railway 🚂' : 'Local Dev 💻'}         ║`);
        console.log(`  ╚══════════════════════════════════════╝\n`);
      });
    })
    .catch((err) => {
      console.error('[DB] Connection failed:', err.message);
      process.exit(1);
    });
} else {
  // Vercel serverless — connect per request via middleware
  app.use('/api', async (req, res, next) => {
    try { await connectDB(); next(); }
    catch(err) { res.status(503).json({ error: err.message, code: 'DB_ERROR' }); }
  });
}

// Required for Vercel
module.exports = app;
