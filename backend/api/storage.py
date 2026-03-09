"""
S3/MinIO storage backend for media files
"""
import os
from django.core.files.storage import Storage


class S3DeferredStorage(Storage):
    """
    Placeholder storage when S3/MinIO is not yet configured (e.g. Render first deploy).
    Raises a clear error on first upload attempt. Used so Django can start without S3.
    """
    def _check_configured(self):
        if not (
            os.getenv('AWS_ACCESS_KEY_ID') and
            os.getenv('AWS_SECRET_ACCESS_KEY') and
            os.getenv('AWS_STORAGE_BUCKET_NAME')
        ):
            raise ValueError(
                "S3/MinIO not configured. Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, "
                "and AWS_STORAGE_BUCKET_NAME to the panorama-secrets environment group "
                "(or backend Environment), then redeploy."
            )

    def save(self, name, content, max_length=None):
        self._check_configured()
        from api.storage import S3MediaStorage
        return S3MediaStorage().save(name, content, max_length)

    def delete(self, name):
        self._check_configured()
        from api.storage import S3MediaStorage
        return S3MediaStorage().delete(name)

    def exists(self, name):
        return False

    def url(self, name):
        self._check_configured()
        from api.storage import S3MediaStorage
        return S3MediaStorage().url(name)


class S3MediaStorage(Storage):
    """
    S3/MinIO storage backend for media files.
    Uses django-storages S3Boto3Storage for S3-compatible backends (AWS S3, MinIO, etc.).
    Configuration is read from Django settings (AWS_*, AWS_S3_*).
    """
    def __init__(self, **kwargs):
        from storages.backends.s3boto3 import S3Boto3Storage
        self._storage = S3Boto3Storage()

    def _normalize_name(self, name):
        return name.replace('\\', '/') if name else name

    def save(self, name, content, max_length=None):
        name = self._normalize_name(name)
        return self._storage.save(name, content, max_length=max_length)

    def delete(self, name):
        name = self._normalize_name(name)
        return self._storage.delete(name)

    def exists(self, name):
        name = self._normalize_name(name)
        return self._storage.exists(name)

    def url(self, name):
        name = self._normalize_name(name)
        return self._storage.url(name)

    def size(self, name):
        name = self._normalize_name(name)
        return self._storage.size(name)


# Backward compatibility for migrations that reference CloudinaryMediaStorage
CloudinaryMediaStorage = S3MediaStorage
CloudinaryDeferredStorage = S3DeferredStorage
