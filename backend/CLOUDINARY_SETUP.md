# Cloudinary Storage Setup

**IMPORTANT**: Cloudinary is now used for media file storage. Cloudinary provides automatic image optimization, transformations, and CDN delivery.

## Prerequisites

1. A Cloudinary account (free tier available)
2. Cloudinary credentials from your dashboard

## Installation

The required packages are already in `requirements.txt`. Install them with:

```bash
pip install -r requirements.txt
```

## Configuration

**REQUIRED**: Add the following environment variables to your `.env` file:

```env
# Cloudinary credentials (REQUIRED)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Getting Your Credentials

1. Sign up for a free account at https://cloudinary.com
2. Log in to your Cloudinary dashboard
3. Go to the Dashboard section
4. Copy your:
   - **Cloud Name** (e.g., `demo`)
   - **API Key** (e.g., `123456789012345`)
   - **API Secret** (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

5. Add these values to your `.env` file in the `backend/` directory

## Features

Cloudinary provides:
- **Automatic image optimization** - Images are optimized for web delivery
- **CDN delivery** - Fast global content delivery
- **Image transformations** - Resize, crop, format conversion on-the-fly
- **Public URLs** - No CORS issues, images are accessible directly
- **Automatic format selection** - Serves WebP when supported by browser

## Testing

After configuration:

1. Restart your Django server
2. Upload a product image through the admin interface or API
3. Check that the image URL points to Cloudinary (format: `https://res.cloudinary.com/your-cloud-name/image/upload/...`)
4. Verify the image is accessible via the URL

## Important Notes

- **Cloudinary URLs are public by default** - No authentication needed to view images
- **Free tier limits** - Check Cloudinary's free tier limits for storage and bandwidth
- **Image transformations** - You can add transformation parameters to URLs for on-the-fly image processing
- **Local development** - If Cloudinary credentials are not set, the app falls back to local file storage in DEBUG mode

## Troubleshooting

### Images not uploading
- Verify your credentials are correct in `.env`
- Check that `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are set
- Ensure the credentials match your Cloudinary dashboard

### Images not accessible
- Cloudinary URLs are public by default, so CORS should not be an issue
- Check that the image was uploaded successfully (check Cloudinary dashboard)
- Verify the URL format is correct (should start with `https://res.cloudinary.com/`)

### SSL errors
- Cloudinary uses HTTPS by default, ensure your network allows HTTPS connections
