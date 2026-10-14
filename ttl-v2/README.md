# ✦ Trafinmarket v2.0 — Full Stack PDF Platform

## ⚡ Quick Start

### Mac / Linux
```bash
./setup.sh    # One-time setup wizard
./start.sh    # Start the server
```

### Windows
```
Double-click setup.bat → follow prompts
Double-click start.bat → server launches
```

Then open: **http://localhost:5000**  
Admin panel: **http://localhost:5000/admin**

---

## 📁 Project Structure
```
ttl-v2/
├── frontend/
│   ├── index.html       ← Store (quiz + library + bundles + coming soon)
│   └── reader.html      ← Secure PDF reader (no download/screenshot)
├── admin/
│   └── index.html       ← Admin panel
├── backend/
│   ├── server.js
│   ├── .env             ← Your config (created by setup.sh)
│   ├── models/          ← User, Product, Bundle, Order, UserAccess, Coupon
│   ├── routes/          ← auth, products, bundles, payments, reader, orders, coupons
│   ├── middleware/       ← JWT auth + access control
│   └── utils/           ← Email delivery
├── setup.sh             ← One-click setup wizard
├── start.sh             ← Mac/Linux launch
└── start.bat            ← Windows launch
```

---

## 🔑 Admin Features
- Upload PDFs with cover images
- Set prices in ₹ INR and $ USD
- Set access duration (30/60/90/180 days per PDF)
- Create bundle packages with discounts
- Coupon codes (percentage or flat)
- View all orders and revenue stats
- Monitor active user access

## 🔒 PDF Security
- No download button — ever
- PDFs served only via authenticated API
- Rendered page-by-page via PDF.js to canvas
- User email watermark on every page
- Right-click disabled
- Keyboard shortcuts blocked (Ctrl+P, Ctrl+S, PrintScreen)
- DevTools detection (content blurs when open)
- Canvas getImageData scrambled (blocks extension screenshots)
- Access expires automatically (1–3 months)

## 💳 Payment Flow
1. Customer takes quiz → gets recommendation
2. Clicks Buy → sees Brutal Truth warning
3. Confirms understanding → payment modal opens
4. Razorpay (₹ INR) or Stripe ($ USD)
5. Payment confirmed → access granted instantly
6. Confirmation email sent
7. Customer reads in secure reader

## 🔧 Environment Variables
| Key | Description | Where to get |
|-----|-------------|--------------|
| MONGODB_URI | Database | mongodb.com/atlas (free) |
| RAZORPAY_KEY_ID | Razorpay public key | razorpay.com/dashboard |
| RAZORPAY_KEY_SECRET | Razorpay secret | razorpay.com/dashboard |
| STRIPE_SECRET_KEY | Stripe secret | dashboard.stripe.com |
| STRIPE_PUBLISHABLE_KEY | Stripe public key | dashboard.stripe.com |
| SMTP_USER | Gmail address | Your Gmail |
| SMTP_PASS | Gmail App Password | Google Account → Security → App Passwords |
| ADMIN_EMAIL | Admin login | Your choice |
| ADMIN_PASSWORD | Admin password | Your choice (change before going live!) |
