# Render deployment (Blueprint)

This repo includes a Render Blueprint at `render.yaml` that provisions:

- `db` (Postgres)
- `backend` (Django + gunicorn web service)
- `frontend` (Vite static site)
- `refresh-prices` (cron job, every 10 minutes)

## Setup steps

1. In the Render Dashboard, choose **New > Blueprint** and select this repository.
2. Render will show the resources from `render.yaml`. Create them.
3. Before (or immediately after) the first deploy, set the required backend secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_STORAGE_BUCKET_NAME`
   - (For MinIO: `AWS_S3_ENDPOINT_URL`, `AWS_S3_REGION_NAME`)

The cron job reuses these values from `backend`, so you only need to set them once.

## Notes

- The backend runs migrations + `collectstatic` during deploy via `preDeployCommand`.
- The frontend is configured as an SPA (rewrite `/*` to `/index.html`).
- The frontend’s API base URL comes from `VITE_URL` / `VITE_API_URL`. In Render it’s wired to the backend hostname; the frontend normalizes it to `https://...` automatically.

