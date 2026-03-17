# MinIO Storage Setup

**IMPORTANT**: MinIO (S3-compatible) is now used for media file storage. Works with MinIO on VPS, AWS S3, or any S3-compatible backend.

## Prerequisites

1. MinIO server running on your VPS (or AWS S3 / S3-compatible service)
2. A bucket created for media files
3. Access key and secret key for programmatic access

## Installation

The required packages are already in `requirements.txt`. Install them with:

```bash
pip install -r requirements.txt
```

## Configuration

**REQUIRED**: Add the following environment variables to your `.env` file:

```env
# MinIO/S3 credentials (REQUIRED)
AWS_ACCESS_KEY_ID=your_minio_access_key
AWS_SECRET_ACCESS_KEY=your_minio_secret_key
AWS_STORAGE_BUCKET_NAME=panorama-media

# MinIO endpoint (required for MinIO; omit for AWS S3)
# Examples:
#   - MinIO on VPS (HTTPS): https://minio.yourdomain.com
#   - MinIO in Docker: http://minio:9000
#   - Local MinIO: http://localhost:9000
AWS_S3_ENDPOINT_URL=https://minio.yourdomain.com

# Region (MinIO accepts any value, e.g. us-east-1)
AWS_S3_REGION_NAME=us-east-1

# SSL (true for HTTPS, false for HTTP)
AWS_S3_USE_SSL=true

# Backend public URL (REQUIRED in production when behind reverse proxy)
# Used to build correct /api/media/ proxy URLs. Without this, images may return Access Denied.
# Examples: https://api.yourdomain.com, https://panorama-backend.onrender.com
BACKEND_PUBLIC_URL=https://your-backend-domain.com
```

## Getting Your Credentials

### MinIO on VPS

1. Install MinIO on your server (see https://min.io/docs/minio/linux/index.html)
2. Create a bucket (e.g. `panorama-media` or `plateformes`)
3. Create access keys via MinIO Console or `mc admin user` / `mc admin policy`
4. **Keep the bucket PRIVATE** – Django uses presigned URLs for secure access

### Security: Keep Bucket Private (Required)

**Do NOT** set a public bucket policy. The app uses presigned URLs so only users who receive URLs from your API can access files.

If your bucket is currently public (anyone can browse/download without login), remove anonymous access:

**Using MinIO Client (mc):**

```bash
# Install mc, then add your server
./mc alias set myminio https://your-minio-endpoint ACCESS_KEY SECRET_KEY

# Remove all anonymous access from the bucket
./mc anonymous set none myminio/plateformes
```

**Using MinIO Console (Web UI):**

1. Open MinIO Console and log in
2. Go to **Buckets** → your bucket → **Access** or **Manage**
3. Remove any bucket policy that allows `Principal: "*"` or anonymous access
4. Ensure no public/anonymous policy is applied

## Testing

After configuration:

1. Restart your Django server
2. Upload a product image through the admin interface or API
3. Check that the image URL points to your MinIO bucket
4. Verify the image is accessible via the URL

## Important Notes

- **Private bucket** - Keep the bucket private; Django generates presigned URLs (valid 1 hour) for each file
- **CORS** - If uploading from browser, configure CORS on the bucket
- **Local development** - Use `AWS_S3_USE_SSL=false` if MinIO runs on HTTP

## Migrating External Asset Logos

Asset logos from external APIs (Clearbit, CoinGecko, etc.) may not load because those APIs block or rate-limit server requests. To migrate them to your storage:

```bash
python manage.py migrate_external_asset_logos
```

Use `--dry-run` to preview, or `--limit 10` to process a few assets first.

## Troubleshooting

### Images not uploading
- Verify credentials in `.env`
- Check that `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_STORAGE_BUCKET_NAME` are set
- Ensure the bucket exists and you have write permissions
- For MinIO: verify `AWS_S3_ENDPOINT_URL` is correct and reachable

### Images not accessible (Access Denied)
- **Set `BACKEND_PUBLIC_URL`** in production: your backend's public URL (e.g. `https://api.yourdomain.com`). Required when behind a reverse proxy so the API returns correct proxy URLs instead of direct MinIO URLs.
- Ensure the bucket is private (no anonymous policy)
- The API serves images via `/api/media/<path>/` proxy; direct MinIO URLs will fail on private buckets
- Verify CORS if accessing from a web app

### SSL errors
- Set `AWS_S3_USE_SSL=true` for HTTPS endpoints
- Set `AWS_S3_USE_SSL=false` for HTTP (e.g. local MinIO)
