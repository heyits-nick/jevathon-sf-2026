"""Opaque trip access tokens.

Tokens are generated once at trip creation and returned to the caller. Only
the SHA-256 hash is persisted, so a leaked database dump does not hand out
usable tokens.
"""

import hashlib
import hmac
import secrets


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), token_hash)
