# Food For You Backend

```bash
npm install
npm run dev
```

The API runs on `http://localhost:8000` by default.

## Environment

Create `backend/.env` from `.env.example`:

```bash
cp .env.example .env
```

For voice transcription, set:

```env
OPENAI_API_KEY=your_openai_key_here
OPENAI_TRANSCRIPTION_MODEL=whisper-1
```

`OPENAI_TRANSCRIPTION_MODEL` defaults to `whisper-1`.

Food selection uses **AI rerank** (grounded in filtered candidates) when `FOOD_RERANK_ENABLED=true` and `OPENAI_API_KEY` is set. On failure, it falls back to rule-based scoring in `recommendation.service.ts`.

Optional:

```env
FOOD_RERANK_ENABLED=true
FOOD_RERANK_CANDIDATE_POOL_SIZE=12
```

## API docs (Swagger UI)

Mở trình duyệt tại:

```text
http://localhost:8000/docs
```

Tại đây bạn có thể xem contract và thử gọi trực tiếp `GET /health`, `POST /api/recommend`, `POST /api/correct`.

OpenAPI spec JSON: `http://localhost:8000/docs/openapi.json`

## Voice transcription

Frontend sends recorded audio to:

```text
POST /api/transcribe
Content-Type: audio/webm
Body: raw audio bytes
```

Response:

```json
{
  "status": "ok",
  "text": "Mình có 1 tiếng nghỉ, cần món nóng dưới 80k"
}
```
