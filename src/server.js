import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { connectDb } from './db.js';
import { MemberPortrait, Memory } from './models.js';

const app = express();

// Render/Proxies: make req.ip respect X-Forwarded-For
app.set('trust proxy', 1);

const PORT = process.env.PORT || 10000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MV_API_KEY = (process.env.MV_API_KEY || '').trim();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(morgan('tiny'));
app.use(express.json({ limit: '1mb' }));

const corsOptions = {
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-MV-KEY'],
  maxAge: 86400
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

function requireKey(req, res, next) {
  if (!MV_API_KEY) return next();
  const key = req.get('X-MV-KEY');
  if (key && key === MV_API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Very small in-memory rate limiter (good enough for a small private site)
function rateLimit({ windowMs, max, keyPrefix }) {
  const bucket = new Map();
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const cur = bucket.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > cur.resetAt) {
      cur.count = 0;
      cur.resetAt = now + windowMs;
    }

    cur.count += 1;
    bucket.set(key, cur);

    if (cur.count > max) {
      res.setHeader('Retry-After', Math.ceil((cur.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }

    next();
  };
}

const limitMutations = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'mut' });

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Multer in-memory upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        ...options
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// --- Member portraits ---
app.get('/api/member-portraits', async (req, res) => {
  const rows = await MemberPortrait.find({}).lean();
  const map = Object.fromEntries(rows.map(r => [r.memberId, r.url]));
  res.json({ portraits: map });
});

app.post('/api/member-portraits', limitMutations, requireKey, upload.single('file'), async (req, res) => {
  const memberId = String(req.body.memberId || '').trim();
  if (!memberId) return res.status(400).json({ error: 'memberId is required' });
  if (!req.file?.buffer) return res.status(400).json({ error: 'file is required' });

  const result = await uploadBufferToCloudinary(req.file.buffer, {
    folder: 'mess_verse/members',
    public_id: `portrait_${memberId}`,
    overwrite: true,
    transformation: [
      { width: 1200, height: 1200, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  });

  const saved = await MemberPortrait.findOneAndUpdate(
    { memberId },
    { $set: { url: result.secure_url, cloudinaryId: result.public_id } },
    { new: true, upsert: true }
  ).lean();

  res.json({ ok: true, portrait: saved });
});

// --- Memories (gallery) ---
app.get('/api/memories', async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 60), 200);
  const rows = await Memory.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ memories: rows });
});

app.post('/api/memories', limitMutations, requireKey, upload.single('file'), async (req, res) => {
  const caption = (req.body.caption || '').toString().trim() || null;
  const alt = (req.body.alt || '').toString().trim() || caption || 'MessVerse memory';
  const memberId = (req.body.memberId || '').toString().trim() || null;

  if (!req.file?.buffer) return res.status(400).json({ error: 'file is required' });

  const result = await uploadBufferToCloudinary(req.file.buffer, {
    folder: 'mess_verse/memories',
    transformation: [
      { width: 2200, height: 2200, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  });

  const saved = await Memory.create({
    url: result.secure_url,
    cloudinaryId: result.public_id,
    caption,
    alt,
    memberId
  });

  res.json({ ok: true, memory: saved });
});

app.delete('/api/memories/:id', limitMutations, requireKey, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required' });

  let deleted;
  try {
    deleted = await Memory.findByIdAndDelete(id);
  } catch (e) {
    // Invalid ObjectId or other cast error
    return res.status(400).json({ error: 'Invalid id' });
  }

  if (!deleted) return res.status(404).json({ error: 'Not found' });

  if (deleted.cloudinaryId) {
    try {
      await cloudinary.uploader.destroy(deleted.cloudinaryId, { resource_type: 'image' });
    } catch {
      // If Cloudinary delete fails, we still consider the DB delete successful.
    }
  }

  res.json({ ok: true });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

process.on('SIGINT', async () => {
  process.exit(0);
});

// Start only after DB connect
connectDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`mess_verse_backend listening on :${PORT}`);
    });
  })
  .catch((e) => {
    console.error('DB connection failed:', e?.message || e);
    process.exit(1);
  });
