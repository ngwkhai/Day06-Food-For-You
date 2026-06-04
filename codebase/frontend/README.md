# Food For You Frontend

React/Next.js frontend for the Food For You recommendation experience.

## Run locally

Terminal 1 — backend:

```bash
cd backend
npm install
npm start
```

Terminal 2 — frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The app runs at:

```text
http://localhost:3000
```

## Backend API connection

Frontend calls these backend endpoints:

| Action | Endpoint | Body |
|--------|----------|------|
| Chat mới / làm rõ | `POST /api/recommend` | `{ message, constraints }` |
| Sửa tiêu chí sau gợi ý | `POST /api/correct` | `{ message, constraints }` |
| Health check | `GET /health` | — |

Environment:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The chat UI stores `constraints` returned by backend and sends them back on the next turn.
