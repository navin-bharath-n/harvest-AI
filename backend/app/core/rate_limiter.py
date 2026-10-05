import time
from collections import defaultdict
from threading import Lock
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)

class SlidingWindowRateLimiter:
    """
    Thread-safe in-memory sliding window rate limiter and brute-force protection.
    Tracks failed attempts and general requests per key (e.g., IP address or user email).
    """

    def __init__(self):
        self._lock = Lock()
        # key -> list of timestamps (float)
        self._events = defaultdict(list)
        # key -> lockout timestamp (float) until which requests are blocked
        self._lockouts = {}

    def _cleanup_old_events(self, key: str, window_seconds: int, now: float):
        """Remove events older than window_seconds."""
        threshold = now - window_seconds
        self._events[key] = [t for t in self._events[key] if t > threshold]
        if not self._events[key]:
            del self._events[key]

    def is_locked(self, key: str) -> Tuple[bool, int]:
        """
        Check if a key is currently locked out.
        Returns (is_locked, remaining_lockout_seconds).
        """
        now = time.time()
        with self._lock:
            lockout_until = self._lockouts.get(key)
            if lockout_until:
                if now < lockout_until:
                    remaining = int(lockout_until - now) + 1
                    return True, remaining
                else:
                    del self._lockouts[key]
        return False, 0

    def record_failed_attempt(
        self,
        key: str,
        max_attempts: int = 5,
        window_seconds: int = 900,  # 15 minutes
        lockout_seconds: int = 900   # 15 minutes lockout
    ) -> Tuple[bool, int, int]:
        """
        Records a failed attempt. If failed attempts exceed max_attempts within window_seconds,
        locks out the key for lockout_seconds.
        Returns (is_now_locked, attempts_count, remaining_lockout_seconds).
        """
        now = time.time()
        with self._lock:
            # Check existing lockout
            lockout_until = self._lockouts.get(key)
            if lockout_until and now < lockout_until:
                remaining = int(lockout_until - now) + 1
                return True, max_attempts, remaining

            # Clean and append event
            self._cleanup_old_events(key, window_seconds, now)
            self._events[key].append(now)
            attempts = len(self._events[key])

            if attempts >= max_attempts:
                self._lockouts[key] = now + lockout_seconds
                logger.warning(
                    f"SECURITY ALERT: Rate limit exceeded for identifier '{key}'. "
                    f"Locked out for {lockout_seconds} seconds."
                )
                return True, attempts, lockout_seconds

            return False, attempts, 0

    def clear_failed_attempts(self, key: str):
        """Reset failed attempts on successful authentication."""
        with self._lock:
            if key in self._events:
                del self._events[key]
            if key in self._lockouts:
                del self._lockouts[key]

    def check_rate_limit(
        self,
        key: str,
        max_requests: int = 10,
        window_seconds: int = 3600  # 1 hour
    ) -> Tuple[bool, int]:
        """
        General sliding window rate check (e.g. for registration endpoint).
        Returns (is_allowed, remaining_seconds_or_count).
        """
        now = time.time()
        with self._lock:
            self._cleanup_old_events(key, window_seconds, now)
            count = len(self._events[key])
            if count >= max_requests:
                oldest = self._events[key][0]
                retry_after = int(oldest + window_seconds - now) + 1
                return False, max(1, retry_after)

            self._events[key].append(now)
            return True, max_requests - count - 1

# Global singleton rate limiters
login_limiter = SlidingWindowRateLimiter()
registration_limiter = SlidingWindowRateLimiter()
