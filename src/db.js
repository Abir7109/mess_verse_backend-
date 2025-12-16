import mongoose from 'mongoose';

const MONGODB_URI = (process.env.MONGODB_URI || '').trim();

export async function connectDb() {
  if (!MONGODB_URI) throw new Error('Missing env var: MONGODB_URI');
  // Reuse connection if already connected
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000
  });

  return mongoose.connection;
}
