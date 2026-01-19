"""
Cloudinary storage backend for media files
"""
from cloudinary_storage.storage import MediaCloudinaryStorage
from django.conf import settings


class CloudinaryMediaStorage(MediaCloudinaryStorage):
    """
    Custom Cloudinary storage class for media files
    Cloudinary handles image optimization, transformations, and CDN delivery automatically
    """
    pass
