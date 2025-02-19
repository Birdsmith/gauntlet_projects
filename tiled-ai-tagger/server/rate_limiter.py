from fastapi import HTTPException, Request
from typing import Dict, Tuple
import time
from .config import settings

class RateLimiter:
    """Rate limiter for API endpoints using a sliding window."""
    
    def __init__(self):
        """Initialize rate limiter with settings."""
        self.window_size = settings.RATE_LIMIT_WINDOW  # seconds
        self.max_requests = settings.RATE_LIMIT_MAX_REQUESTS
        self.requests: Dict[str, list[float]] = {}
    
    def _clean_old_requests(self, client_id: str):
        """Remove requests outside the current window."""
        current_time = time.time()
        window_start = current_time - self.window_size
        
        if client_id in self.requests:
            self.requests[client_id] = [
                ts for ts in self.requests[client_id]
                if ts > window_start
            ]
    
    def check_rate_limit(self, request: Request) -> Tuple[bool, int]:
        """Check if a request should be rate limited.
        
        Returns:
            Tuple of (is_allowed, retry_after)
        """
        # Get client identifier (IP address or API key)
        client_id = request.client.host
        current_time = time.time()
        
        # Clean old requests
        self._clean_old_requests(client_id)
        
        # Initialize request list for new clients
        if client_id not in self.requests:
            self.requests[client_id] = []
        
        # Count requests in current window
        request_count = len(self.requests[client_id])
        
        if request_count >= self.max_requests:
            # Calculate time until oldest request expires
            oldest_request = self.requests[client_id][0]
            retry_after = int(oldest_request + self.window_size - current_time)
            return False, retry_after
        
        # Add new request
        self.requests[client_id].append(current_time)
        return True, 0
    
    async def check_rate_limit_dependency(self, request: Request):
        """FastAPI dependency for rate limiting."""
        is_allowed, retry_after = self.check_rate_limit(request)
        
        if not is_allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many requests",
                headers={"Retry-After": str(retry_after)}
            ) 