import logging

from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

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
            return

        prev = Transaction.objects.filter(pk=instance.pk).only("status", "type", "transfer_to").first()
        instance._previous_status = getattr(prev, "status", None)
        instance._previous_type = getattr(prev, "type", None)
        instance._previous_transfer_to = getattr(prev, "transfer_to", None)
    except Exception as e:
        logger.warning("Failed to capture previous Transaction state: %s", e)
        instance._previous_status = None
        instance._previous_type = None
        instance._previous_transfer_to = None


@receiver(post_save, sender=Transaction)
def _transaction_generate_positions_on_termine(sender, instance: Transaction, created: bool, **kwargs):
    """
    Idempotently generate positions for investment transactions when they reach 'termine'.
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

        previous_status = getattr(instance, "_previous_status", None)
        should_generate = (
            previous_status != "termine"
            or not Position.objects.filter(transaction=instance).exists()
        )
        if not should_generate:
            return

        create_positions_for_investment(instance)
    except Exception as e:
        logger.error("Failed to auto-generate positions for transaction %s: %s", getattr(instance, "id", None), e, exc_info=True)

