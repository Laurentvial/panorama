"""
Database connection management middleware.

This middleware ensures database connections are closed after each request
to prevent connection pool exhaustion, especially important for databases
with limited connection slots (e.g., Scalingo PostgreSQL).
"""
import os
import time
from django.conf import settings
from django.db import connections, close_old_connections
from django.db import connection as default_connection, reset_queries
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
        # If CONN_MAX_AGE is non-zero, Django is allowed to persist connections.
        # In that case, aggressively closing connections here defeats the purpose and adds overhead.
        conn_max_age = (
            getattr(settings, "CONN_MAX_AGE", None)
            if getattr(settings, "CONN_MAX_AGE", None) is not None
            else settings.DATABASES.get("default", {}).get("CONN_MAX_AGE", 0)
        )
        if conn_max_age not in (0, "0", None):
            return self.get_response(request)

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


class SQLProfileMiddleware:
    """
    Optional request-level SQL profiling for development.

    Enabled when SQL_PROFILE=true and DEBUG=true.
    Adds response headers and logs query count and timing.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        enabled = (
            getattr(settings, "DEBUG", False)
            and os.getenv("SQL_PROFILE", "").lower() in ("1", "true", "yes", "on")
        )

        if not enabled:
            return self.get_response(request)

        # connection.queries is only populated when DEBUG=True.
        reset_queries()
        start = time.perf_counter()
        response = self.get_response(request)
        elapsed_ms = (time.perf_counter() - start) * 1000.0

        queries = list(getattr(default_connection, "queries", []) or [])
        query_count = len(queries)
        sql_time_ms = 0.0
        for q in queries:
            try:
                sql_time_ms += float(q.get("time", 0) or 0) * 1000.0
            except Exception:
                continue

        # Keep headers short and numeric for easy parsing.
        response["X-Profile-Queries"] = str(query_count)
        response["X-Profile-SQL-Ms"] = f"{sql_time_ms:.2f}"
        response["X-Profile-Resp-Ms"] = f"{elapsed_ms:.2f}"

        try:
            path = getattr(request, "path", "")
            method = getattr(request, "method", "")
            logger.info(
                "SQL profile %s %s: %s queries, sql=%.2fms, resp=%.2fms",
                method,
                path,
                query_count,
                sql_time_ms,
                elapsed_ms,
            )
        except Exception:
            pass

        return response
