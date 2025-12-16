import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

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
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()) }));

function requireKey(req, res, next) {
  if (!MV_API_KEY) return next();
  const key = req.get('X-MV-KEY');
  if (key && key === MV_API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

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
  const rows = await prisma.memberPortrait.findMany();
  const map = Object.fromEntries(rows.map(r => [r.memberId, r.url]));
  res.json({ portraits: map });
});

app.post('/api/member-portraits', requireKey, upload.single('file'), async (req, res) => {
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

  const saved = await prisma.memberPortrait.upsert({
    where: { memberId },
    update: { url: result.secure_url, cloudinaryId: result.public_id },
    create: { memberId, url: result.secure_url, cloudinaryId: result.public_id }
  });

  res.json({ ok: true, portrait: saved });
});

// --- Memories (gallery) ---
app.get('/api/memories', async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 60), 200);
  const rows = await prisma.memory.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit
  });
  res.json({ memories: rows });
});

app.post('/api/memories', requireKey, upload.single('file'), async (req, res) => {
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

  const saved = await prisma.memory.create({
    data: {
      url: result.secure_url,
      cloudinaryId: result.public_id,
      caption,
      alt,
      memberId
    }
  });

  res.json({ ok: true, memory: saved });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`mess_verse_backend listening on :${PORT}`);
});
