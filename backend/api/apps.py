from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        import logging

        logger = logging.getLogger(__name__)

        # Optional signal handlers: log failures, but don't block startup.
        try:
            from . import signals  # noqa: F401
        except Exception:
            logger.exception("Failed to import optional API signals module ('api.signals').")

        # Mandatory: if this fails, the position audit feature will not work.
        try:
            from .position_audit import connect_position_audit_signals
            connect_position_audit_signals()
        except Exception:
            logger.exception("Failed to connect position audit signals. Startup aborted.")
            raise
