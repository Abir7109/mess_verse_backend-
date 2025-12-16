import mongoose from 'mongoose';

const MemberPortraitSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true, unique: true, index: true },
    url: { type: String, required: true },
    cloudinaryId: { type: String }
  },
  { timestamps: true }
);

const MemorySchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    cloudinaryId: { type: String },
    caption: { type: String },
    alt: { type: String },
    memberId: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MemorySchema.index({ createdAt: -1 });

export const MemberPortrait = mongoose.model('MemberPortrait', MemberPortraitSchema);
export const Memory = mongoose.model('Memory', MemorySchema);
