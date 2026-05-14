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
        # Namespace all newly uploaded media per deployment/app.
        # Example: MEDIA_KEY_PREFIX=staging-app-a -> staging-app-a/user_profiles/...
        self._media_key_prefix = (os.getenv('MEDIA_KEY_PREFIX') or '').strip().strip('/')
        # Prefix only tenant/private buckets that must not be shared globally.
        self._prefixed_top_level_dirs = {
            'app_settings',
            'client_documents',
            'client_profiles',
            'kyc',
            'successors',
            'user_profiles',
        }

    def _normalize_name(self, name):
        return name.replace('\\', '/') if name else name

    def _should_apply_media_key_prefix(self, name):
        normalized_name = self._normalize_name(name)
        if not normalized_name:
            return False
        top_level_dir = normalized_name.lstrip('/').split('/', 1)[0]
        return top_level_dir in self._prefixed_top_level_dirs

    def _prefix_upload_name(self, name):
        """
        Apply MEDIA_KEY_PREFIX to new uploads while keeping backward compatibility.
        Existing DB rows can still reference legacy keys without prefix.
        """
        name = self._normalize_name(name)
        if not name or not self._media_key_prefix:
            return name
        # Storage.save should receive object keys, not full URLs.
        if name.startswith(('http://', 'https://')):
            return name
        # Prevent double-prefixing when callers already include MEDIA_KEY_PREFIX.
        if name == self._media_key_prefix or name.startswith(f'{self._media_key_prefix}/'):
            return name
        if not self._should_apply_media_key_prefix(name):
            return name
        return f'{self._media_key_prefix}/{name.lstrip("/")}'

    def _resolve_name_for_operations(self, name):
        """
        Resolve object key for read/delete operations.

        Priority:
        1) legacy/unprefixed key (if it exists)
        2) prefixed key (if it exists)
        3) prefixed key as deterministic fallback when not found
        """
        normalized_name = self._normalize_name(name)
        if not normalized_name:
            return normalized_name
        if normalized_name.startswith(('http://', 'https://')):
            return normalized_name

        prefixed_name = self._prefix_upload_name(normalized_name)
        if prefixed_name == normalized_name:
            return normalized_name

        if self._storage.exists(normalized_name):
            return normalized_name
        if self._storage.exists(prefixed_name):
            return prefixed_name
        return prefixed_name

    def save(self, name, content, max_length=None):
        name = self._prefix_upload_name(name)
        return self._storage.save(name, content, max_length=max_length)

    def delete(self, name):
        name = self._resolve_name_for_operations(name)
        return self._storage.delete(name)

    def exists(self, name):
        name = self._resolve_name_for_operations(name)
        return self._storage.exists(name)

    def url(self, name):
        name = self._resolve_name_for_operations(name)
        return self._storage.url(name)

    def size(self, name):
        name = self._resolve_name_for_operations(name)
        return self._storage.size(name)

    def _open(self, name, mode='rb'):
        """Open a file from S3. Required for FileField.open() (e.g. product image copy)."""
        name = self._resolve_name_for_operations(name)
        return self._storage._open(name, mode)


# Backward compatibility: migrations reference CloudinaryMediaStorage (now S3)
CloudinaryMediaStorage = S3MediaStorage
CloudinaryDeferredStorage = S3DeferredStorage
