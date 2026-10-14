const mongoose = require('mongoose');
const blogSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  excerpt:     { type: String, required: true, maxlength: 300 },
  content:     { type: String, required: true }, // HTML content
  coverImage:  { type: String, default: null },
  category:    { type: String, enum: ['share-market','forex','crypto','psychology','general'], default: 'general' },
  tags:        [{ type: String }],
  author:      { type: String, default: 'Trafinmarket' },
  isPublished: { type: Boolean, default: false },
  metaTitle:   { type: String },
  metaDesc:    { type: String },
  readTime:    { type: Number, default: 5 }, // minutes
  views:       { type: Number, default: 0 },
  publishedAt: { type: Date },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now }
});
blogSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.isPublished && !this.publishedAt) this.publishedAt = new Date();
  // Auto generate slug from title if not set
  if (!this.slug) this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  // Auto calc read time
  const words = this.content.replace(/<[^>]+>/g,'').split(/\s+/).length;
  this.readTime = Math.max(1, Math.round(words / 200));
  next();
});
module.exports = mongoose.model('Blog', blogSchema);
