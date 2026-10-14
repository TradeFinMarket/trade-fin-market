const express = require('express');
const router  = express.Router();
const Blog    = require('../models/Blog');
const { protect, adminOnly } = require('../middleware/auth');

// PUBLIC: list published posts
router.get('/', async (req, res) => {
  try {
    const { category, limit = 10, page = 1 } = req.query;
    const filter = { isPublished: true };
    if (category && category !== 'all') filter.category = category;
    const total = await Blog.countDocuments(filter);
    const posts = await Blog.find(filter)
      .select('-content')
      .sort('-publishedAt')
      .limit(parseInt(limit))
      .skip((parseInt(page)-1) * parseInt(limit));
    res.json({ posts, total, pages: Math.ceil(total/parseInt(limit)) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUBLIC: single post by slug
router.get('/:slug', async (req, res) => {
  try {
    const post = await Blog.findOneAndUpdate(
      { slug: req.params.slug, isPublished: true },
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ post });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: list all posts
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const posts = await Blog.find().select('-content').sort('-createdAt');
    res.json({ posts, total: posts.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: create post
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { title, slug, excerpt, content, category, tags, coverImage, isPublished, metaTitle, metaDesc, author } = req.body;
    const autoSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const post = await Blog.create({ title, slug: autoSlug, excerpt, content, category, tags: tags||[], coverImage, isPublished: isPublished||false, metaTitle: metaTitle||title, metaDesc: metaDesc||excerpt, author: author||'Trafinmarket' });
    res.status(201).json({ post });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: update post
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const post = await Blog.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ post });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: delete post
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Blog.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
