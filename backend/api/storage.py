"""
Cloudinary storage backend for media files
"""
from django.core.files.storage import Storage
from django.conf import settings
import cloudinary
import cloudinary.uploader
from cloudinary_storage.storage import MediaCloudinaryStorage


class CloudinaryDeferredStorage(Storage):
    """
    Placeholder storage when Cloudinary is not yet configured (e.g. Render first deploy).
    Raises a clear error on first upload attempt. Used so Django can start without Cloudinary.
    """
    def _check_configured(self):
        from django.conf import settings
        c = getattr(settings, 'CLOUDINARY_STORAGE', {})
        if not (c.get('CLOUD_NAME') and c.get('API_KEY') and c.get('API_SECRET')):
            raise ValueError(
                "Cloudinary not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, "
                "and CLOUDINARY_API_SECRET in Render Dashboard → backend → Environment, then redeploy."
            )

    def save(self, name, content, max_length=None):
        self._check_configured()
        return CloudinaryMediaStorage().save(name, content, max_length)

    def delete(self, name):
        self._check_configured()
        return CloudinaryMediaStorage().delete(name)

    def exists(self, name):
        return False

    def url(self, name):
        self._check_configured()
        return CloudinaryMediaStorage().url(name)


class CloudinaryMediaStorage(MediaCloudinaryStorage):
    """
    Custom Cloudinary storage class for media files
    Cloudinary handles image optimization, transformations, and CDN delivery automatically
    
    MediaCloudinaryStorage should already return absolute Cloudinary URLs (https://res.cloudinary.com/...)
    This class ensures proper URL generation and handles edge cases.
    """
    
    def _upload(self, name, content):
        """
        Override _upload to specify resource_type='raw' for PDFs and other non-image files.
        This ensures PDFs are uploaded correctly and can be accessed via /raw/upload/ URLs.
        Uses the same upload method as MediaCloudinaryStorage but with resource_type='raw' for PDFs.
        """
        # Normalize the name: replace backslashes with forward slashes (Windows compatibility)
        name = name.replace('\\', '/')
        
        # Determine resource type based on file extension
        is_raw_file = name.lower().endswith(('.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.txt', '.csv'))
        
        if is_raw_file:
            # For raw files (PDFs, etc.), upload with resource_type='raw'
            # Use the same options pattern as MediaCloudinaryStorage._upload
            import os
            
            # Build options exactly like MediaCloudinaryStorage does
            options = {
                'use_filename': True,
                'resource_type': 'raw',  # Use raw instead of image
                'tags': self.TAG if hasattr(self, 'TAG') else None,
            }
            
            # Add folder if name contains a path
            folder = os.path.dirname(name)
            if folder:
                options['folder'] = folder
            
            # Remove None values from options
            options = {k: v for k, v in options.items() if v is not None}
            
            # Upload using the same method as MediaCloudinaryStorage
            # This ensures signed upload with API credentials (no unsigned parameter needed)
            upload_result = cloudinary.uploader.upload(content, **options)
            
            # MediaCloudinaryStorage._save expects _upload to return a dict-like response
            # containing a `public_id` key. Returning a bare string causes:
            # TypeError: string indices must be integers, not 'str'
            if isinstance(upload_result, dict):
                if 'public_id' in upload_result:
                    return upload_result
                # Keep behavior resilient if Cloudinary response shape changes.
                return {**upload_result, 'public_id': upload_result.get('public_id') or name}

            if isinstance(upload_result, str):
                # Normalize string response to dict contract expected by cloudinary_storage.
                return {'public_id': upload_result}

            # Fallback for unexpected response types.
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Unexpected upload result type: {type(upload_result)}, value: {upload_result}")
            return {'public_id': name}
        else:
            # For images, use the parent method (MediaCloudinaryStorage)
            return super()._upload(name, content)
    
    def save(self, name, content, max_length=None):
        """
        Override save to normalize the name and ensure proper upload.
        """
        # Normalize the name: replace backslashes with forward slashes (Windows compatibility)
        name = name.replace('\\', '/')
        
        # Use parent method which will call our overridden _upload
        return super().save(name, content, max_length)
    
    def url(self, name):
        """
        Override url method to ensure absolute Cloudinary URLs are returned.
        For PDFs and other raw files, generate URLs with /raw/upload/ instead of /image/upload/.
        """
        try:
            # Normalize the name
            name = name.replace('\\', '/')
            
            # Determine if it's a PDF or other raw file type
            is_raw_file = name.lower().endswith(('.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.txt', '.csv'))
            
            if is_raw_file:
                # For raw files, generate URL directly with /raw/upload/
                # Add fl_inline parameter to force inline display (preview) instead of download
                try:
                    cloudinary_config = getattr(settings, 'CLOUDINARY_STORAGE', {})
                    cloud_name = cloudinary_config.get('CLOUD_NAME', '')
                    
                    if cloud_name:
                        # Build Cloudinary raw file URL
                        # Format: https://res.cloudinary.com/{cloud_name}/raw/upload/{public_id}
                        # Note: Cloudinary serves raw files with Content-Disposition: attachment by default
                        # We'll use media_proxy to override this with Content-Disposition: inline
                        public_id = name.lstrip('/')
                        # Normalize backslashes to forward slashes
                        public_id = public_id.replace('\\', '/')
                        url = f"https://res.cloudinary.com/{cloud_name}/raw/upload/{public_id}"
                        return url
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Error generating raw file URL for {name}: {str(e)}")
                    # Fallback to parent method
            
            # For images, use the parent method (MediaCloudinaryStorage)
            url = super().url(name)
            
            # MediaCloudinaryStorage should return absolute URLs, but verify
            if url and (url.startswith('http://') or url.startswith('https://')):
                # Cloudinary URLs should include the actual public_id path
                if 'res.cloudinary.com' in url:
                    # Ensure raw files use /raw/upload/ instead of /image/upload/
                    if is_raw_file and '/image/upload/' in url:
                        url = url.replace('/image/upload/', '/raw/upload/fl_inline/')
                    elif is_raw_file and '/raw/upload/' in url and '/fl_inline/' not in url:
                        # Add fl_inline if not already present for raw files
                        url = url.replace('/raw/upload/', '/raw/upload/fl_inline/')
                    return url
                # If it's an absolute URL but not Cloudinary, return as-is (might be a custom domain)
                return url
            
            # If URL is relative (shouldn't happen with Cloudinary, but handle it)
            if url and not url.startswith('http'):
                cloudinary_config = getattr(settings, 'CLOUDINARY_STORAGE', {})
                cloud_name = cloudinary_config.get('CLOUD_NAME', '')
                
                if cloud_name:
                    # Build absolute Cloudinary URL
                    # Use /raw/upload/ for PDFs, /image/upload/ for images
                    resource_type = 'raw' if is_raw_file else 'image'
                    # Format: https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{path}
                    if url.startswith('/'):
                        url = url[1:]  # Remove leading slash
                    return f"https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{url}"
            
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
