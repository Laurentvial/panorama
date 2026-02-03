import logging

from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.utils import timezone
from django.core.signals import request_finished
from django.db import close_old_connections, connections

from .models import Transaction, Position
from .position_service import create_positions_for_investment

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Transaction)
def _transaction_capture_previous_state(sender, instance: Transaction, **kwargs):
    """
    Capture previous values so post_save can detect state transitions.

    This is needed because admin/ORM updates bypass the API endpoint logic that
    normally generates monthly positions when an investment becomes 'termine'.
    """
    try:
        if not instance.pk:
            instance._previous_status = None
            instance._previous_type = None
            instance._previous_transfer_to = None
            instance._previous_validated_at = None
        else:
            prev = Transaction.objects.filter(pk=instance.pk).only("status", "type", "transfer_to", "validated_at").first()
            instance._previous_status = getattr(prev, "status", None)
            instance._previous_type = getattr(prev, "type", None)
            instance._previous_transfer_to = getattr(prev, "transfer_to", None)
            instance._previous_validated_at = getattr(prev, "validated_at", None)

    except Exception as e:
        logger.warning("Failed to capture previous Transaction state: %s", e)
        instance._previous_status = None
        instance._previous_type = None
        instance._previous_transfer_to = None
        instance._previous_validated_at = None

    # If we are transitioning to 'termine', capture a stable validated_at timestamp.
    # This ensures position generation starts at validation time (not creation time),
    # even if the transaction is created days earlier.
    try:
        previous_status = getattr(instance, "_previous_status", None)
        if previous_status != "termine" and instance.status == "termine" and not getattr(instance, "validated_at", None):
            instance.validated_at = timezone.now()
    except Exception:
        # Best-effort; validation timestamp isn't critical enough to crash saves.
        pass


@receiver(post_save, sender=Transaction)
def _transaction_generate_positions_on_termine(sender, instance: Transaction, created: bool, **kwargs):
    """
    Idempotently generate positions for investment transactions when they reach 'termine'.
    
    Skip generation if skip_auto_position_generation flag is set (for staged modal flow).
    """
    try:
        is_investment = (
            instance.type == "transfert"
            and bool(instance.transfer_to)
            and instance.transfer_to != "balance"
        )
        if not is_investment:
            return

        if instance.status != "termine":
            return

        # Skip if flag is set (set by API when using staged generation flow)
        if getattr(instance, "_skip_auto_position_generation", False):
            logger.debug("Skipping auto-position generation for transaction %s (skip flag set)", getattr(instance, "id", None))
            return

        previous_status = getattr(instance, "_previous_status", None)
        
        # Idempotent logic: generate positions if:
        # 1. Status just changed to "termine" (previous_status != "termine"), OR
        # 2. Status is "termine" but no positions exist (recovery from accidental deletion)
        # Note: create_positions_for_investment is idempotent and will only create missing positions
        existing_positions_count = Position.objects.filter(transaction=instance).count()
        status_changed_to_termine = previous_status != "termine"
        no_positions_exist = existing_positions_count == 0
        
        # If status didn't change AND positions already exist, skip (already fully generated)
        if not status_changed_to_termine and existing_positions_count > 0:
            logger.debug("Skipping auto-position generation for transaction %s (%d positions already exist, status unchanged)", getattr(instance, "id", None), existing_positions_count)
            return
        
        # Generate if status changed to "termine" OR if no positions exist (recovery case)
        if status_changed_to_termine:
            logger.info("Auto-generating positions for transaction %s (status changed to termine)", getattr(instance, "id", None))
        elif no_positions_exist:
            logger.info("Auto-generating positions for transaction %s (recovery: status is termine but no positions exist)", getattr(instance, "id", None))
        else:
            # This shouldn't happen, but log it
            logger.warning("Unexpected state in position generation signal for transaction %s", getattr(instance, "id", None))
            return
        
        create_positions_for_investment(instance, trigger="signal")
    except Exception as e:
        logger.error("Failed to auto-generate positions for transaction %s: %s", getattr(instance, "id", None), e, exc_info=True)


@receiver(request_finished)
def close_db_connections_on_request_finished(sender, **kwargs):
    """
    Signal handler to aggressively close database connections after each request.
    This provides an additional safety net beyond the middleware to prevent
    connection pool exhaustion.
    """
    try:
        close_old_connections()
        # Also explicitly close all connections
        for conn in connections.all():
            try:
                if hasattr(conn, 'connection') and conn.connection is not None:
                    # Use getattr with default True to handle drivers that don't have 'closed' attribute
                    is_closed = getattr(conn.connection, 'closed', True)
                    if not is_closed:
                        conn.close()
            except Exception:
                pass
    except Exception as e:
        logger.debug(f"Error closing connections in signal handler: {e}")

