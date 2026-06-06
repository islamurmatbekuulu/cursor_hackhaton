"""In-memory anonymization receipt store.

Enforces the KVKK ordering rule: /detect only runs if a fresh /anonymize
receipt (the blurred image's SHA-256) was issued within the TTL window. No
identity data is stored — only an opaque content hash and a timestamp.
"""

from __future__ import annotations

import threading
import time


class ReceiptStore:
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._issued: dict[str, float] = {}

    def issue(self, sha256: str) -> None:
        with self._lock:
            self._prune_locked()
            self._issued[sha256] = time.monotonic()

    def is_fresh(self, sha256: str) -> bool:
        if not sha256:
            return False
        with self._lock:
            self._prune_locked()
            return sha256 in self._issued

    def _prune_locked(self) -> None:
        now = time.monotonic()
        expired = [k for k, t in self._issued.items() if now - t > self._ttl]
        for k in expired:
            del self._issued[k]
