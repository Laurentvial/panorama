# Impossible Cloud Storage Setup

**IMPORTANT**: Cloud storage is now **required**. The application no longer supports local file storage. All media files (product images, client photos, etc.) must be stored in Impossible Cloud.

## Prerequisites

1. An Impossible Cloud account
2. An S3-compatible bucket created in Impossible Cloud
3. Access keys (Access Key ID and Secret Access Key)

## Installation

The required packages are already in `requirements.txt`. Install them with:

```bash
pip install -r requirements.txt
```

## Configuration

**REQUIRED**: Add the following environment variables to your `.env` file. The application will not start without these credentials:

```env
# Impossible Cloud credentials (REQUIRED)
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_STORAGE_BUCKET_NAME=your_bucket_name

# Impossible Cloud endpoint (region-specific format)
# Format: https://{region}.storage.impossibleapi.net
# Examples:
#   - us-east-1: https://us-east-1.storage.impossibleapi.net
#   - eu-east-1: https://eu-east-1.storage.impossibleapi.net
#   - eu-central-1: https://eu-central-1.storage.impossibleapi.net
AWS_S3_ENDPOINT_URL=https://us-east-1.storage.impossibleapi.net

# Region (must match the endpoint region)
AWS_S3_REGION_NAME=us-east-1

# Optional: Custom domain for your bucket (if configured)
AWS_S3_CUSTOM_DOMAIN=your-custom-domain.com
```

## Getting Your Credentials

1. Log in to your Impossible Cloud dashboard
2. Navigate to the S3-compatible storage section
3. Create a bucket if you haven't already
4. Generate access keys (Access Key ID and Secret Access Key)
5. Copy these values to your `.env` file

## Bucket Configuration

Make sure your bucket is configured with:
- **Public read access via bucket policies** (for images to be accessible via URLs)
  - **Important**: Impossible Cloud buckets do NOT support ACLs (Access Control Lists)
  - You must configure public read access using bucket policies instead
  - In your Impossible Cloud dashboard, set up a bucket policy that allows public read access
- **CORS enabled** (if accessing from web applications)

## Testing

After configuration:

1. Restart your Django server
2. Upload a product image through the admin interface
3. Check that the image URL points to your Impossible Cloud bucket
4. Verify the image is accessible via the URL

## Important Notes

- **Cloud storage is mandatory** - The application requires Impossible Cloud credentials to start
- **No local storage** - All media files are stored exclusively in Impossible Cloud
- **Missing credentials** - If credentials are not set, the application will fail to start with a clear error message

## Troubleshooting

### Images not uploading
- Verify your credentials are correct
- Check that the bucket name is correct
- Ensure the bucket exists and you have write permissions
- **If you see "AccessControlListNotSupported" error**: This means ACLs are not supported. The application is configured to not use ACLs, but ensure `AWS_DEFAULT_ACL=None` in settings

### Images not accessible
- Verify bucket has public read access via bucket policies (not ACLs)
- Check CORS configuration if accessing from a web app
- Verify the custom domain (if used) is properly configured
- Ensure the endpoint URL uses the correct format: `https://{region}.storage.impossibleapi.net`
- URLs use path-style addressing: `https://{region}.storage.impossibleapi.net/{bucket-name}/path/to/file`

### SSL errors
- Ensure `AWS_S3_USE_SSL=True` and `AWS_S3_VERIFY=True` are set
- Check that your endpoint URL uses HTTPS
