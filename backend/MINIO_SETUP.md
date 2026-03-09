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
```

## Getting Your Credentials

### MinIO on VPS

1. Install MinIO on your server (see https://min.io/docs/minio/linux/index.html)
2. Create a bucket (e.g. `panorama-media`)
3. Create access keys via MinIO Console or `mc admin user` / `mc admin policy`
4. Configure the bucket for public read access if you want direct URLs (or use presigned URLs)

### Bucket Policy (Public Read)

For public image URLs, add a bucket policy. Replace `panorama-media` with your actual bucket name.

**Option A: MinIO Console (Web UI)**

1. Open MinIO Console (e.g. `http://localhost:9001` or `https://minio.yourdomain.com`)
2. Log in with your admin credentials
3. Click **Buckets** in the left sidebar
4. Click your bucket name (e.g. `panorama-media`)
5. Go to **Access** or **Manage** tab
6. Find **Access Policy** or **Bucket Policy**
7. Paste the policy below and save

**Option B: MinIO Client (mc)**

1. Install mc: `curl https://dl.min.io/client/mc/release/linux-amd64/mc -o mc && chmod +x mc`
2. Add your MinIO server: `./mc alias set myminio http://localhost:9000 ACCESS_KEY SECRET_KEY`
3. Create a file `policy.json` with the content below
4. Apply it: `./mc anonymous set-json policy.json myminio/panorama-media`

**Policy JSON:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::panorama-media/*"
    }
  ]
}
```

**Note:** Some MinIO versions use a simpler format. If the above fails, try setting anonymous access to `download`:

```bash
mc anonymous set download myminio/panorama-media
```

## Testing

After configuration:

1. Restart your Django server
2. Upload a product image through the admin interface or API
3. Check that the image URL points to your MinIO bucket
4. Verify the image is accessible via the URL

## Important Notes

- **Public URLs** - Configure bucket policy for public read if you want direct access
- **CORS** - If uploading from browser, configure CORS on the bucket
- **Local development** - Use `AWS_S3_USE_SSL=false` if MinIO runs on HTTP

## Troubleshooting

### Images not uploading
- Verify credentials in `.env`
- Check that `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_STORAGE_BUCKET_NAME` are set
- Ensure the bucket exists and you have write permissions
- For MinIO: verify `AWS_S3_ENDPOINT_URL` is correct and reachable

### Images not accessible
- Check bucket policy allows public read (or use presigned URLs)
- Verify CORS if accessing from a web app
- Ensure the URL format is correct (MinIO path-style or virtual-host-style)

### SSL errors
- Set `AWS_S3_USE_SSL=true` for HTTPS endpoints
- Set `AWS_S3_USE_SSL=false` for HTTP (e.g. local MinIO)
