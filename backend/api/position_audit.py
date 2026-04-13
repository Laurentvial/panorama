"""
Audit context for Position deletions: thread-local trigger stack + request user (middleware).
Used by pre_delete on Position to persist PositionDeletionRecord rows.
"""
from __future__ import annotations

import logging
import threading
import uuid
from contextlib import contextmanager
from decimal import Decimal
from typing import Any, Iterator

_logger = logging.getLogger(__name__)

_tls = threading.local()


def _ensure_tls() -> None:
    if not hasattr(_tls, 'stack'):
        _tls.stack = []
    if not hasattr(_tls, 'request_user_id'):
        _tls.request_user_id = None


@contextmanager
def position_deletion_audit(trigger: str, batch_id: str | None = None) -> Iterator[str]:
    """
    Push audit context for the duration of a block that deletes Position rows.
    Yields the batch_id (UUID string) used for this batch.
    """
    _ensure_tls()
    bid = batch_id or str(uuid.uuid4())
    _tls.stack.append({'trigger': trigger, 'batch_id': bid})
    try:
        yield bid
    finally:
        _tls.stack.pop()


def get_audit_trigger() -> str:
    _ensure_tls()
    if _tls.stack:
        return _tls.stack[-1]['trigger']
    return 'unknown'


def get_audit_batch_id() -> str | None:
    _ensure_tls()
    if _tls.stack:
        return _tls.stack[-1]['batch_id']
    return None


def set_request_user_for_audit(user_id: int | None) -> None:
    _ensure_tls()
    _tls.request_user_id = user_id


def clear_request_user_for_audit() -> None:
    _ensure_tls()
    _tls.request_user_id = None


def get_actor_user_id() -> int | None:
    _ensure_tls()
    return _tls.request_user_id


def _snapshot_for_position(instance: Any) -> dict[str, Any]:
    """Serialize a Position instance for JSONField (no Decimal)."""
    def _dec(v):
        if v is None:
            return None
        if isinstance(v, Decimal):
            return str(v)
        return v

    return {
        'status': instance.status,
        'period_index': instance.period_index,
        'period_date': instance.period_date.isoformat() if instance.period_date else None,
        'invested_amount': _dec(instance.invested_amount),
        'profit_loss': _dec(instance.profit_loss),
        'opened_at': instance.opened_at.isoformat() if instance.opened_at else None,
        'closed_at': instance.closed_at.isoformat() if instance.closed_at else None,
        'asset_id': instance.asset_id,
    }


def _position_pre_delete(sender, instance, **kwargs):
    try:
        from django.contrib.auth import get_user_model

        from .models import PositionDeletionRecord

        User = get_user_model()
        trigger = get_audit_trigger()
        batch_id = get_audit_batch_id()
        uid = get_actor_user_id()
        actor = None
        if uid is not None:
            try:
                actor = User.objects.get(pk=uid)
            except User.DoesNotExist:
                pass

        rid = uuid.uuid4().hex[:12]
        while PositionDeletionRecord.objects.filter(id=rid).exists():
            rid = uuid.uuid4().hex[:12]

        PositionDeletionRecord.objects.create(
            id=rid,
            position_id=instance.id,
            client_id=instance.client_id,
            transaction_id=instance.transaction_id,
            product_id=instance.product_id,
            snapshot=_snapshot_for_position(instance),
            trigger=trigger[:128],
            actor_user=actor,
            batch_id=batch_id,
            details={},
        )
    except Exception as e:
        _logger.exception('Position deletion audit failed (non-fatal): %s', e)


def connect_position_audit_signals():
    from django.db.models.signals import pre_delete

    from .models import Position

    pre_delete.connect(_position_pre_delete, sender=Position, dispatch_uid='position_audit_pre_delete')
