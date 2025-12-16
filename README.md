# MessVerse backend
API for MessVerse uploads (Cloudinary) + metadata storage (MongoDB).

## Routes
- GET `/health`
- GET `/api/member-portraits`
- POST `/api/member-portraits` (multipart: `memberId`, `file`)
- GET `/api/memories`
- POST `/api/memories` (multipart: `caption?`, `alt?`, `memberId?`, `file`)

If `MV_API_KEY` is set, POST routes require header: `X-MV-KEY: <MV_API_KEY>`.

## Local dev
1. Copy `.env.example` to `.env` and fill values.
2. Install deps:
   - `npm install`
3. Run dev:
   - `npm run dev`

## Render deployment
- Create a MongoDB database (commonly MongoDB Atlas) and set `MONGODB_URI`.
- Create a **Web Service** from this repo.
- Set env vars: `MONGODB_URI`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optionally `MV_API_KEY`.
- Build command: `npm install`
- Start command: `npm start`
