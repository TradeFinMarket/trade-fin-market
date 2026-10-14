const nodemailer = require('nodemailer');
const t = () => nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT, secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });

const tpl = (body) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#080C16;font-family:Georgia,serif}.w{max-width:600px;margin:0 auto;background:#0F1525;border:1px solid rgba(201,168,76,0.2)}.h{padding:32px 40px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.1)}.logo{font-size:20px;color:#C9A84C;letter-spacing:0.2em;text-transform:uppercase}.sub{font-size:9px;color:#6B7280;letter-spacing:0.4em;margin-top:4px}.b{padding:40px}.title{font-size:26px;color:#F0EDE6;margin-bottom:14px;font-weight:normal}.text{font-size:13px;color:#9CA3AF;line-height:2;margin-bottom:14px}.btn{display:inline-block;background:#C9A84C;color:#080C16;padding:15px 34px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;font-family:sans-serif;font-weight:600;margin:10px 0;border-radius:6px}.div{height:1px;background:linear-gradient(to right,transparent,rgba(201,168,76,0.3),transparent);margin:20px 0}.row{display:flex;justify-content:space-between;font-size:12px;color:#6B7280;padding:7px 0;border-bottom:1px solid rgba(201,168,76,0.06);font-family:sans-serif}.val{color:#D1D5DB}.foot{padding:18px 40px;text-align:center;border-top:1px solid rgba(201,168,76,0.08);font-size:10px;color:#6B7280;font-family:sans-serif;line-height:1.8}</style></head><body><div class="w"><div class="h"><div class="logo">Trafinmarket</div><div class="sub">Premium Knowledge Platform</div></div><div class="b">${body}</div><div class="foot">&copy; Trafinmarket &nbsp;|&nbsp; Educational purposes only. Not investment advice.</div></div></body></html>`;

exports.sendPurchaseConfirmation = async ({ order, item }) => {
  const fmt = (a, c) => c === 'INR' ? '&#8377;' + (a/100).toFixed(2) : '$' + (a/100).toFixed(2);
  const body = `<div class="title">Access Granted &#10022;</div>
<p class="text">Dear ${order.customerName}, your purchase is confirmed. Sign in to Trafinmarket to start reading your PDF.</p>
<div style="text-align:center;margin:24px 0"><a class="btn" href="${process.env.FRONTEND_URL}">&#8594; Open My Library</a></div>
<div class="div"></div>
<div class="row"><span>Order No.</span><span class="val">${order.orderNumber}</span></div>
<div class="row"><span>PDF / Bundle</span><span class="val">${item?.title || item?.name || 'N/A'}</span></div>
<div class="row"><span>Amount Paid</span><span class="val">${fmt(order.finalAmount, order.currency)}</span></div>
<div class="row"><span>Access Duration</span><span class="val">${order.accessDurationDays} days</span></div>
<div class="div"></div>
<p class="text" style="font-size:11px">&#128274; All content is read-only. No downloads, no screenshots, no screen recording. Access is monitored and time-limited — use it wisely.</p>`;
  await t().sendMail({ from: process.env.EMAIL_FROM, to: order.customerEmail, subject: `&#10022; Access Confirmed — ${item?.title || item?.name}`, html: tpl(body) });
};

exports.sendWelcome = async ({ name, email }) => {
  const body = `<div class="title">Welcome to Trafinmarket &#10022;</div>
<p class="text">Dear ${name}, your account is ready. Start with our free foundational PDF — no payment required.</p>
<div style="text-align:center;margin:24px 0"><a class="btn" href="${process.env.FRONTEND_URL}">Explore the Library</a></div>`;
  await t().sendMail({ from: process.env.EMAIL_FROM, to: email, subject: 'Welcome to Trafinmarket', html: tpl(body) });
};

// Export transporter factory and FROM for direct use in auth.js OTP emails
exports.transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: +(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
exports.FROM = process.env.EMAIL_FROM || 'Trafinmarket <noreply@tradelibrary.com>';
