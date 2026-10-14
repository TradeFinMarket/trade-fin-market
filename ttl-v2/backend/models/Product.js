const mongoose = require('mongoose');
const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  shortDesc: { type: String, default: '' },
  category: { type: String, required: true, enum: ['share','forex','crypto','general'] },
  level: { type: String, required: true, enum: ['Basic','Intermediate','Advance','Super Advance','Pro Advance'] },
  author: { type: String, default: 'Trafinmarket' },
  priceINR: { type: Number, default: 0 },
  priceUSD: { type: Number, default: 0 },
  isFree: { type: Boolean, default: false },
  accessDurationDays: { type: Number, default: 90 },
  filePath: { type: String, default: '' },
  fileUrl:       { type: String, default: '' },   // legacy field
  cloudUrl:      { type: String, default: null }, // Cloudinary secure URL
  cloudPublicId: { type: String, default: null }, // Cloudinary public ID for signed URLs
  localPath:     { type: String, default: null }, // local dev only
  fileName: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  coverImage: { type: String, default: null },
  badge: { type: String, default: '' },
  pages: { type: Number, default: null },
  tags: [String],
  whatYouLearn: [String],
  isActive: { type: Boolean, default: true },
  showOnHomepage: { type: Boolean, default: true }, // admin controls which appear on main page
  totalSales: { type: Number, default: 0 },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Product', productSchema);
