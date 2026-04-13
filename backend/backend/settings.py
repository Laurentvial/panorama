from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv
import os
import dj_database_url

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file in the backend directory
load_dotenv(BASE_DIR / '.env')


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-$d9#&idh+8806+kf5=q&8e68$o=8e)utm0shlbm27(t0q6$400')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'True').lower() == 'true'

ALLOWED_HOSTS = ['*']

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

# Disable CSRF for API endpoints (using JWT instead)
# Add Railway domain if RAILWAY_PUBLIC_DOMAIN is set
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
# Add Railway domain dynamically
railway_domain = os.getenv('RAILWAY_PUBLIC_DOMAIN')
if railway_domain:
    # Ensure the domain has a scheme (http:// or https://)
    if not railway_domain.startswith(('http://', 'https://')):
        railway_domain = f'https://{railway_domain}'
    CSRF_TRUSTED_ORIGINS.append(railway_domain)
# Also support RAILWAY_STATIC_URL if provided
railway_static_url = os.getenv('RAILWAY_STATIC_URL')
if railway_static_url:
    # Ensure the URL has a scheme (http:// or https://)
    if not railway_static_url.startswith(('http://', 'https://')):
        railway_static_url = f'https://{railway_static_url}'
    CSRF_TRUSTED_ORIGINS.append(railway_static_url)

# Add Render domain dynamically (for onrender.com URL)
render_external_url = os.getenv('RENDER_EXTERNAL_URL')
if render_external_url:
    if not render_external_url.startswith(('http://', 'https://')):
        render_external_url = f'https://{render_external_url}'
    CSRF_TRUSTED_ORIGINS.append(render_external_url)

# Add Coolify / generic backend URL (for self-hosted VPS)
backend_public_url = os.getenv('BACKEND_PUBLIC_URL') or os.getenv('COOLIFY_EXTERNAL_URL')
if backend_public_url:
    if not backend_public_url.startswith(('http://', 'https://')):
        backend_public_url = f'https://{backend_public_url}'
    CSRF_TRUSTED_ORIGINS.append(backend_public_url)

# Backend public URL for building absolute media proxy URLs (required when behind reverse proxy)
# Used when request.build_absolute_uri() would use wrong host (e.g. internal hostname)
BACKEND_PUBLIC_URL = (
    os.getenv('BACKEND_PUBLIC_URL') or
    os.getenv('COOLIFY_EXTERNAL_URL') or
    os.getenv('RENDER_EXTERNAL_URL') or
    os.getenv('RAILWAY_STATIC_URL') or
    ''
).strip()
if BACKEND_PUBLIC_URL and not BACKEND_PUBLIC_URL.startswith(('http://', 'https://')):
    BACKEND_PUBLIC_URL = f'https://{BACKEND_PUBLIC_URL}'
BACKEND_PUBLIC_URL = BACKEND_PUBLIC_URL.rstrip('/') if BACKEND_PUBLIC_URL else ''

# Behind nginx/Traefik/Coolify, Django otherwise sees http + internal Host and
# build_absolute_uri() yields http://... URLs (mixed content) or wrong host for
# media proxies and favicons. Disable with TRUST_FORWARDED_HEADERS=false.
if os.getenv('TRUST_FORWARDED_HEADERS', 'true' if not DEBUG else 'false').lower() in ('1', 'true', 'yes'):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    USE_X_FORWARDED_HOST = True

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
}

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'storages',  # For cloud storage support
    'api.apps.ApiConfig',
    'rest_framework',
    'corsheaders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # CORS middleware DOIT être le premier
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'api.middleware.PositionAuditMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'api.middleware.CloseDBConnectionsMiddleware',  # Close DB connections after each request
]

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / "panorama/frontend/templates"],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

DATABASE_URL = os.getenv("DATABASE_URL")
# Connection max age: 0 = close immediately, None = keep forever, or seconds
# Lower values prevent connection pool exhaustion on limited DB plans
# For Scalingo/limited connection pools, use 0 to close connections immediately
CONN_MAX_AGE = int(os.getenv("DB_CONN_MAX_AGE", "0"))  # Default 0 seconds (close immediately)

if DATABASE_URL:
    # Scalingo/Render: require SSL. Coolify/internal Docker: often no SSL.
    # Set DB_SSL_REQUIRE=false for Coolify or other internal Postgres without SSL.
    ssl_require = os.getenv("DB_SSL_REQUIRE", "true").lower() in ("true", "1", "yes")
    db_config = dj_database_url.config(
        default=DATABASE_URL,
        conn_max_age=CONN_MAX_AGE,
        ssl_require=ssl_require,
    )
    # Explicitly set CONN_MAX_AGE to ensure it's applied (override any defaults)
    # Force CONN_MAX_AGE to 0 to ensure connections are closed immediately
    db_config['CONN_MAX_AGE'] = 0  # Force immediate closure
    # Add connection options to prevent too many connections
    db_config.setdefault('OPTIONS', {})
    db_options = {
        'connect_timeout': 10,
        # Ensure connections are properly closed and limit idle time
        'options': '-c statement_timeout=30000 -c idle_in_transaction_session_timeout=10000',  # 30s statement timeout, 10s idle timeout
    }
    # Explicitly set sslmode in OPTIONS to override URL parsing (Coolify/internal Postgres often needs disable)
    if not ssl_require:
        db_options['sslmode'] = 'disable'
    db_config['OPTIONS'].update(db_options)
    # Disable atomic requests to prevent long-held connections
    db_config['ATOMIC_REQUESTS'] = False
    DATABASES = {
        "default": db_config
    }
else:
    # Local/dev (or other platforms) using discrete DB_* env vars
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME"),
            "USER": os.getenv("DB_USER"),
            "PASSWORD": os.getenv("DB_PASSWORD"),
            "HOST": os.getenv("DB_HOST"),
            "PORT": os.getenv("DB_PORT"),
            "CONN_MAX_AGE": 0,  # Force immediate closure to prevent pool exhaustion
            "ATOMIC_REQUESTS": False,  # Disable atomic requests to prevent long-held connections
            "OPTIONS": {
                'connect_timeout': 10,
                'options': '-c statement_timeout=30000 -c idle_in_transaction_session_timeout=10000',  # 30s statement timeout, 10s idle timeout
            },
        }
    }


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'fr-fr'

TIME_ZONE = 'Europe/Paris'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = '/static/'

STATIC_ROOT = BASE_DIR / "staticfiles"

# Media files (user uploads) - S3/MinIO storage
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY', '')
AWS_STORAGE_BUCKET_NAME = os.getenv('AWS_STORAGE_BUCKET_NAME', '')
AWS_S3_ENDPOINT_URL = os.getenv('AWS_S3_ENDPOINT_URL') or None  # e.g. https://minio.votredomaine.com or http://minio:9000
AWS_S3_REGION_NAME = os.getenv('AWS_S3_REGION_NAME', 'us-east-1')
AWS_S3_USE_SSL = os.getenv('AWS_S3_USE_SSL', 'true').lower() in ('true', '1', 'yes')
AWS_S3_CUSTOM_DOMAIN = os.getenv('AWS_S3_CUSTOM_DOMAIN', '')
# MinIO does not support object ACLs - use bucket policy for public read instead
AWS_DEFAULT_ACL = None
# Use presigned URLs so only authenticated API users can access files (bucket must be private)
AWS_QUERYSTRING_AUTH = True
AWS_QUERYSTRING_EXPIRE = 3600  # Presigned URL validity: 1 hour
AWS_S3_ADDRESSING_STYLE = 'path'  # Required for MinIO
AWS_S3_FILE_OVERWRITE = False

S3_CONFIGURED = bool(
    AWS_ACCESS_KEY_ID and
    AWS_SECRET_ACCESS_KEY and
    AWS_STORAGE_BUCKET_NAME
)
IS_RENDER = os.getenv('RENDER', '').lower() == 'true'

# Validate S3/MinIO: required locally; on Render allow startup without it (add secrets after first deploy)
if not S3_CONFIGURED:
    if IS_RENDER:
        pass
    else:
        raise ValueError(
            "S3/MinIO credentials are REQUIRED. "
            "Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_STORAGE_BUCKET_NAME in your environment variables. "
            "Local file storage is no longer supported - all media files must be uploaded to S3/MinIO."
        )

# Use S3/MinIO storage for ALL media files
# On Render without S3: use deferred storage that raises clear error on first upload
# Django 4.2+ storage config (required for Django 5+).
STORAGES = {
    'default': {
        'BACKEND': (
            'api.storage.S3MediaStorage' if S3_CONFIGURED
            else 'api.storage.S3DeferredStorage'
        ),
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / "media"

# Upload handling
# On Windows/Python 3.14 we have seen issues with Django's TemporaryFile cleanup during uploads.
# Keep reasonably-sized uploads in memory to avoid temp-file based handlers.
FILE_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024  # 20MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024  # 20MB

# Only include frontend directories if they exist (for local development)
# On Choreo, frontend is deployed separately, so these directories won't exist
STATICFILES_DIRS = []
for dir_path in [
    BASE_DIR / "frontend/static",
    BASE_DIR / "frontend/dist",
]:
    if dir_path.exists():
        STATICFILES_DIRS.append(dir_path)

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS Configuration
# Note: CORS_ALLOW_ALL_ORIGINS and CORS_ALLOWED_ORIGINS are mutually exclusive
# For production, use explicit allowlist from FRONTEND_PUBLIC_URL; for dev, allow all
CORS_ALLOW_CREDENTIALS = True

# Build allowed origins: dev defaults + FRONTEND_PUBLIC_URL from env
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
frontend_url = (os.getenv('FRONTEND_PUBLIC_URL') or '').strip()
if frontend_url:
    if not frontend_url.startswith(('http://', 'https://')):
        frontend_url = f'https://{frontend_url}'
    CORS_ALLOWED_ORIGINS.append(frontend_url)
    # Add www variant if applicable
    if frontend_url.startswith('https://') and not frontend_url.startswith('https://www.'):
        CORS_ALLOWED_ORIGINS.append(frontend_url.replace('https://', 'https://www.'))

# Use allowlist in production, allow all in dev (when FRONTEND_PUBLIC_URL not set)
CORS_ALLOW_ALL_ORIGINS = not bool(frontend_url)

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# Allow preflight requests
CORS_PREFLIGHT_MAX_AGE = 86400

# Gemini AI Configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
