# Web

Next.js app for the traveler-facing flow in `docs/handoffs/01-frontend-designer.md`.

```bash
cd web
npm install
cp .env.example .env.local   # set BACKEND_API_URL to the shared backend base URL
npm run dev                  # http://localhost:3000
```

- `src/app/api/backend/[...path]/route.ts`: same-origin proxy that forwards only the documented contract paths (`/score`, `/trips…`) to `BACKEND_API_URL`, passing the trip `Authorization` header through.
- `src/lib/api/`: contract types, thin client, error mapping.
- `src/components/score/`: menu score form and reusable result view (verdicts, confidence, sources, timing).
- `/dev/sample`: development-only layout preview labeled "Sample data — no live call"; returns 404 in production builds.
