# Forkplan Web (React)

React + Vite web version of the Forkplan iPhone app, using the same backend REST API, with import/export.

```bash
npm install
npm run dev        # http://localhost:5173  (/api proxied to the backend)
npm run build      # -> dist/
```
- Backend: `FORKPLAN_API` (dev proxy target, defaults to the dev API in the iOS `Debug.xcconfig`).
- Production (AWS Amplify): a rewrite rule `/api/<*>` → `https://<api-id>.execute-api.eu-west-2.amazonaws.com/dev/<*>` (200) proxies API calls, so no CORS setup is needed.
- `VITE_IMAGE_BASE` (optional): S3 bucket URL for recipe photos.
- Routing uses hash URLs (`/#/recipes`), so no SPA rewrite is needed.
