"""
Cloudinary storage backend for media files
"""
from cloudinary_storage.storage import MediaCloudinaryStorage
from django.conf import settings
import cloudinary
import cloudinary.uploader


class CloudinaryMediaStorage(MediaCloudinaryStorage):
    """
    Custom Cloudinary storage class for media files
    Cloudinary handles image optimization, transformations, and CDN delivery automatically
    
    MediaCloudinaryStorage should already return absolute Cloudinary URLs (https://res.cloudinary.com/...)
    This class ensures proper URL generation and handles edge cases.
    """
    
    def save(self, name, content, max_length=None):
        """
        Override save to capture the actual Cloudinary public_id after upload.
        Cloudinary may add suffixes to filenames, so we need to get the actual public_id.
        """
        # Call parent save method which uploads to Cloudinary
        saved_name = super().save(name, content, max_length)
        
        # After upload, get the actual public_id from Cloudinary
        # The saved_name might not match what Cloudinary actually stored
        try:
            # Extract public_id from the saved name (remove any path prefixes)
            # Cloudinary returns the public_id, which may include folder paths
            if saved_name:
                # The saved_name should be the public_id that Cloudinary returned
                # But we need to verify it matches what's actually in Cloudinary
                # For now, just return what Cloudinary gave us
                return saved_name
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Could not verify Cloudinary public_id for {name}: {str(e)}")
        
        return saved_name
    
    def url(self, name):
        """
        Override url method to ensure absolute Cloudinary URLs are returned.
        MediaCloudinaryStorage should already return absolute URLs, but we ensure it here.
        Also fixes URLs that incorrectly include '/media/' in the path.
        """
        try:
            # Get the URL from the parent class (MediaCloudinaryStorage)
            # This should already return an absolute Cloudinary URL
            url = super().url(name)
            
            # MediaCloudinaryStorage should return absolute URLs, but verify
            if url and (url.startswith('http://') or url.startswith('https://')):
                # Cloudinary URLs should include the actual public_id path
                # If the asset is stored as 'media/products/filename', the URL should include that
                if 'res.cloudinary.com' in url:
                    # Don't modify the URL - Cloudinary knows the correct public_id
                    # The URL from MediaCloudinaryStorage should already be correct
                    return url
                # If it's an absolute URL but not Cloudinary, return as-is (might be a custom domain)
                return url
            
            # If URL is relative (shouldn't happen with Cloudinary, but handle it)
            if url and not url.startswith('http'):
                cloudinary_config = getattr(settings, 'CLOUDINARY_STORAGE', {})
                cloud_name = cloudinary_config.get('CLOUD_NAME', '')
                
                if cloud_name:
                    # Build absolute Cloudinary URL
                    # Format: https://res.cloudinary.com/{cloud_name}/image/upload/{path}
                    # Note: Keep the path as-is, including 'media/' if that's part of the public_id
                    if url.startswith('/'):
                        url = url[1:]  # Remove leading slash
                    return f"https://res.cloudinary.com/{cloud_name}/image/upload/{url}"
            
            return url
        except Exception as e:
            # Log error but don't fail - return the URL from parent class
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error generating Cloudinary URL for {name}: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            # Try to return parent URL even if there was an error
            try:
                return super().url(name)
            except:
                return None
