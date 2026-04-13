"""
Database connection management middleware.

This middleware ensures database connections are closed after each request
to prevent connection pool exhaustion, especially important for databases
with limited connection slots (e.g., Scalingo PostgreSQL).
"""
from django.db import connections, close_old_connections
import logging

logger = logging.getLogger(__name__)


class PositionAuditMiddleware:
    """
    Expose the authenticated Django user on thread-local for Position deletion audit
    (pre_delete) during the same HTTP request.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from api.position_audit import clear_request_user_for_audit, set_request_user_for_audit

        user = getattr(request, 'user', None)
        uid = user.pk if user is not None and getattr(user, 'is_authenticated', False) else None
        set_request_user_for_audit(uid)
        try:
            return self.get_response(request)
        finally:
            clear_request_user_for_audit()


class CloseDBConnectionsMiddleware:
    """
    Middleware to aggressively close all database connections after each request.
    
    This prevents connection pool exhaustion by ensuring connections
    are immediately released back to the pool after request processing.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Close old connections before processing the request
        # This ensures we start with a clean slate and releases any stale connections
        self._close_all_connections()
        
        try:
            response = self.get_response(request)
            return response
        finally:
            # Always close connections after request processing, even if there's an error
            # This ensures connections are returned to the pool immediately
            self._close_all_connections()
    
    def _close_all_connections(self):
        """
        Aggressively close all database connections.
        This method ensures connections are properly closed and released.
        """
        try:
            # First, use Django's built-in function to close old connections
            close_old_connections()
        except Exception as e:
            logger.warning(f"Error closing old connections: {e}")
        
        # Then explicitly close all connections as a safety measure
        for conn in connections.all():
            try:
                # Check if connection exists and is open
                if hasattr(conn, 'connection') and conn.connection is not None:
                    # Check if connection is actually open
                    # Use getattr with default True to handle drivers that don't have 'closed' attribute
                    is_closed = getattr(conn.connection, 'closed', True)
                    if not is_closed:
                        conn.close()
                # Also ensure the connection wrapper is cleaned up
                if hasattr(conn, '_close'):
                    conn._close()
            except Exception as e:
                # Ignore errors when closing connections (connection might already be closed)
                logger.debug(f"Error closing connection {conn}: {e}")
                pass
