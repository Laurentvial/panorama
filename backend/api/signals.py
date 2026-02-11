import logging
import uuid
from decimal import Decimal

from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.utils import timezone
from django.core.signals import request_finished
from django.db import close_old_connections, connections

from .models import Transaction, Position, Product
from .position_service import (
    create_positions_for_investment,
    recalculate_positions_for_product_withdrawal,
    _product_compounds,
    create_interest_transaction_for_period_if_complete,
)

logger = logging.getLogger(__name__)
COMPLETED_TRANSACTION_STATUSES = ("valide",)


@receiver(pre_save, sender=Transaction)
def _transaction_capture_previous_state(sender, instance: Transaction, **kwargs):
    """
    Capture previous values so post_save can detect state transitions.

    This is needed because admin/ORM updates bypass the API endpoint logic that
    normally generates monthly positions when an investment becomes 'valide'.
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

    # If we are transitioning to 'valide', capture a stable validated_at timestamp.
    # This ensures position generation starts at validation time (not creation time),
    # even if the transaction is created days earlier.
    try:
        previous_status = getattr(instance, "_previous_status", None)
        if previous_status not in COMPLETED_TRANSACTION_STATUSES and instance.status in COMPLETED_TRANSACTION_STATUSES and not getattr(instance, "validated_at", None):
            instance.validated_at = timezone.now()
    except Exception:
        # Best-effort; validation timestamp isn't critical enough to crash saves.
        pass


@receiver(post_save, sender=Transaction)
def _transaction_generate_positions_on_valide(sender, instance: Transaction, created: bool, **kwargs):
    """
    Idempotently generate positions for investment transactions when they reach 'valide'.
    
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

        if instance.status not in COMPLETED_TRANSACTION_STATUSES:
            return

        # Skip if flag is set (set by API when using staged generation flow)
        if getattr(instance, "_skip_auto_position_generation", False):
            logger.debug("Skipping auto-position generation for transaction %s (skip flag set)", getattr(instance, "id", None))
            return

        previous_status = getattr(instance, "_previous_status", None)
        
        # Idempotent logic: generate positions if:
        # 1. Status just changed to "valide", OR
        # 2. Status is "valide" but no positions exist (recovery from accidental deletion)
        # Note: create_positions_for_investment is idempotent and will only create missing positions
        existing_positions_count = Position.objects.filter(transaction=instance).count()
        status_changed_to_valide = previous_status not in COMPLETED_TRANSACTION_STATUSES
        no_positions_exist = existing_positions_count == 0
        
        # If status didn't change AND positions already exist, skip (already fully generated)
        if not status_changed_to_valide and existing_positions_count > 0:
            logger.debug("Skipping auto-position generation for transaction %s (%d positions already exist, status unchanged)", getattr(instance, "id", None), existing_positions_count)
            return
        
        # Generate if status changed to "valide" OR if no positions exist (recovery case)
        if status_changed_to_valide:
            logger.info("Auto-generating positions for transaction %s (status changed to valide)", getattr(instance, "id", None))
        elif no_positions_exist:
            logger.info("Auto-generating positions for transaction %s (recovery: status is valide but no positions exist)", getattr(instance, "id", None))
        else:
            # This shouldn't happen, but log it
            logger.warning("Unexpected state in position generation signal for transaction %s", getattr(instance, "id", None))
            return
        
        create_positions_for_investment(instance, trigger="signal")
    except Exception as e:
        logger.error("Failed to auto-generate positions for transaction %s: %s", getattr(instance, "id", None), e, exc_info=True)


@receiver(post_save, sender=Transaction)
def _transaction_recalculate_positions_on_withdrawal(sender, instance: Transaction, created: bool, **kwargs):
    """
    Recalculate positions for all investment transactions on the same product
    when a withdrawal (product -> balance) is validated.
    
    This ensures that when capital is withdrawn, future positions are recalculated
    with the new (reduced) invested capital.
    """
    try:
        # Check if this is a withdrawal (transfert from product to balance)
        # A withdrawal is specifically when transfer_to == 'balance'
        is_withdrawal = (
            instance.type == "transfert"
            and instance.transfer_to == "balance"
        )
        if not is_withdrawal:
            return
        
        if instance.status not in COMPLETED_TRANSACTION_STATUSES:
            return
        
        # Skip if flag is set
        if getattr(instance, "_skip_auto_position_generation", False):
            logger.debug("Skipping position recalculation for withdrawal transaction %s (skip flag set)", getattr(instance, "id", None))
            return
        
        previous_status = getattr(instance, "_previous_status", None)
        status_changed_to_valide = previous_status not in COMPLETED_TRANSACTION_STATUSES
        
        # Only recalculate if status just changed to "valide"
        # (to avoid recalculating multiple times if transaction is saved multiple times)
        if not status_changed_to_valide:
            return
        
        logger.info("Recalculating positions after withdrawal transaction %s (status changed to valide)", getattr(instance, "id", None))
        recalculate_positions_for_product_withdrawal(instance)
    except Exception as e:
        logger.error("Failed to recalculate positions after withdrawal transaction %s: %s", getattr(instance, "id", None), e, exc_info=True)


@receiver(pre_save, sender=Position)
def _position_capture_previous_state(sender, instance: Position, **kwargs):
    """
    Capture previous status so post_save can detect when a position transitions to 'done'.
    """
    try:
        if not instance.pk:
            instance._previous_status = None
        else:
            prev = Position.objects.filter(pk=instance.pk).only("status").first()
            instance._previous_status = getattr(prev, "status", None) if prev else None
    except Exception as e:
        logger.warning("Failed to capture previous Position state: %s", e)
        instance._previous_status = None


@receiver(post_save, sender=Position)
def _position_create_interest_transaction_for_period(sender, instance: Position, created: bool, **kwargs):
    """
    Automatically create an 'interets' transaction when all positions of a period are closed ('done')
    for a product without compounding (capitalisation_fonds = False).
    
    This creates one interest transaction per period (monthly, quarterly, etc.) with the total
    profit_loss of all positions in that period.
    """
    try:
        # Only process positions that just transitioned to 'done'
        if instance.status != 'done':
            return
        
        previous_status = getattr(instance, "_previous_status", None)
        # Only process if status just changed to 'done' (not if it was already 'done')
        if previous_status == 'done':
            # Already processed, skip to avoid duplicates
            return
        
        # Check if position is linked to a transaction and product
        if not instance.transaction_id or not instance.product_id:
            return
        
        # Get the transaction
        try:
            txn = instance.transaction
        except Transaction.DoesNotExist:
            logger.warning("Position %s references non-existent transaction %s", instance.id, instance.transaction_id)
            return
        
        # Only process investment transactions (transfert balance -> product)
        if txn.type != 'transfert' or not txn.transfer_to or txn.transfer_to == 'balance':
            return
        
        # Get the product to check compounding setting
        try:
            product = instance.product
        except Product.DoesNotExist:
            logger.warning("Position %s references non-existent product %s", instance.id, instance.product_id)
            return
        
        # Only create interest transactions for non-compounding products
        if _product_compounds(product):
            # Product compounds interests, no interest transaction needed
            return
        
        # Check if position has a period_index
        if instance.period_index is None:
            # Position doesn't belong to a period (e.g., manual trading position)
            return
        
        # Try to create interest transaction for this period if all positions are done
        create_interest_transaction_for_period_if_complete(
            txn,
            instance.period_index,
            trigger="position_closed"
        )
        
    except Exception as e:
        logger.error(
            "Failed to create automatic interest transaction for position %s: %s",
            getattr(instance, 'id', None),
            e,
            exc_info=True
        )


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

