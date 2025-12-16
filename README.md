# MessVerse backend
API for MessVerse uploads (Cloudinary) + metadata storage (Postgres).

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
3. Generate Prisma client:
   - `npm run prisma:generate`
4. Run dev:
   - `npm run dev`

## Render deployment
- Create a **PostgreSQL** instance on Render and use its `DATABASE_URL`.
- Create a **Web Service** from this repo.
- Set env vars: `DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optionally `MV_API_KEY`.
- Start command: `npm start`

Run migrations on deploy:
- Add Render build command: `npm install && npx prisma generate`
- Add Render start command: `npx prisma migrate deploy && npm start`
