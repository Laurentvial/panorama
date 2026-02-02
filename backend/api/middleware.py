"""
Database connection management middleware.

This middleware ensures database connections are closed after each request
to prevent connection pool exhaustion, especially important for databases
with limited connection slots (e.g., Scalingo PostgreSQL).
"""
from django.db import connections, close_old_connections


class CloseDBConnectionsMiddleware:
    """
    Middleware to close all database connections after each request.
    
    This prevents connection pool exhaustion by ensuring connections
    are immediately released back to the pool after request processing.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Close old connections before processing the request
        # This ensures we start with a clean slate
        close_old_connections()
        
        try:
            response = self.get_response(request)
        finally:
            # Always close connections after request processing, even if there's an error
            # This ensures connections are returned to the pool immediately
            close_old_connections()
            # Also explicitly close all connections as a safety measure
            for conn in connections.all():
                try:
                    if conn.connection is not None:
                        conn.close()
                except Exception:
                    # Ignore errors when closing connections
                    pass
        
        return response
