"""Client for Nikhil's backend/menu_fetch HTTP bridge (port 8101 by default).

This adapter never makes a dietary judgment — it returns observed menu text,
dishes, and evidence only. See backend/menu_fetch/README.md for the exact
contract this mirrors.
"""

import os

import httpx

FETCH_TIMEOUT_SECONDS = 45.0


class MenuFetchError(Exception):
    def __init__(self, status: int, code: str, message: str, retryable: bool = False) -> None:
        self.status = status
        self.code = code
        self.message = message
        self.retryable = retryable
        super().__init__(message)


async def fetch_menu(menu_url: str, restaurant: str, timeout: float = FETCH_TIMEOUT_SECONDS) -> dict:
    body = {"menu_url": menu_url}
    if restaurant:
        body["restaurant"] = restaurant
    return await _post("/fetch-menu", body, timeout)


async def search_sources(query: str, limit: int = 5, timeout: float = 15.0) -> dict:
    """Browserbase Search via the bridge: `{query, results:[{id,title,url,snippet}], timing_ms}`.
    Retrieval only — Jev chooses which results to use."""
    return await _post("/search-sources", {"query": query, "limit": limit}, timeout)


async def _post(path: str, body: dict, timeout: float) -> dict:
    base_url = os.environ.get("MENU_FETCH_BASE_URL", "http://127.0.0.1:8101")
    token = os.environ.get("MENU_FETCH_TOKEN")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{base_url.rstrip('/')}{path}", json=body, headers=headers)
    except httpx.TimeoutException as exc:
        raise MenuFetchError(504, "TIMEOUT", "The evidence service timed out.", retryable=True) from exc
    except httpx.HTTPError as exc:
        raise MenuFetchError(
            502, "PROVIDER_FAILURE", "Could not reach the menu evidence service.", retryable=True
        ) from exc

    if response.status_code >= 400:
        try:
            body = response.json()
        except ValueError:
            body = {}
        error = body.get("error", {}) if isinstance(body, dict) else {}
        raise MenuFetchError(
            response.status_code,
            error.get("code", "PROVIDER_FAILURE"),
            error.get("message", "Menu fetch failed."),
            bool(error.get("retryable", False)),
        )

    return response.json()
