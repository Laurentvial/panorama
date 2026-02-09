
import os
import sys
import traceback

# Set Django settings module before importing Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

try:
    from django.core.wsgi import get_wsgi_application
    application = get_wsgi_application()
except Exception as e:
    # Log the error to stderr so it appears in Railway logs
    print("ERROR: Failed to initialize Django WSGI application", file=sys.stderr)
    print(f"Exception type: {type(e).__name__}", file=sys.stderr)
    print(f"Exception message: {str(e)}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.stderr.flush()
    # Re-raise to prevent silent failure
    raise
