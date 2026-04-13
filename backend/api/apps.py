from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        # Import signal handlers
        try:
            from . import signals  # noqa: F401
            from .position_audit import connect_position_audit_signals

            connect_position_audit_signals()
        except Exception:
            # Avoid crashing app startup if optional imports fail
            pass
