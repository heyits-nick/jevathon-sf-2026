"""Deterministic extraction from a fetched shared-post page.

Extraction only proposes: it separates the author's caption from comments and
page chrome, and proposes place strings and restaurant-name segments. Jev
decides which proposal (if any) is right — see jev_client.resolve_place and
jev_client.select_sources. Nothing here understands video or audio; only the
public caption text is used.
"""

import re
from urllib.parse import urlparse

MAX_CAPTION_CHARS = 2000
MAX_PLACE_CANDIDATES = 6

_MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
# Instagram's rendered post header ends with a relative timestamp line such as
# "Edited•3d" or "•2w"; the author's caption follows it.
_IG_TIMESTAMP_LINE = re.compile(r"^\s*(?:Edited\s*)?•\s*\d+\s*[smhdw]\s*$", re.MULTILINE)
_IG_CAPTION_END = re.compile(
    r"^\s*(?:Load more comments|View all \d+ comments|Log in to like or comment|\[!\[)", re.MULTILINE
)

_STREET = (
    r"(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Pl|Place|Broadway|Way|Sq|Square|Dr|Drive|Ln|Lane|"
    r"Pkwy|Parkway|Ct|Court|Hwy|Highway)"
)
_ADDRESS = re.compile(rf"\b\d{{1,5}}\s+(?:[A-Z][\w'’.-]*\s+){{0,3}}{_STREET}\b\.?")
_NAME = r"[A-Z][\w'’.&-]*(?:\s+(?:of|the|de|la|and|&|[A-Z][\w'’.&-]*))*"
_AT_PLACE = re.compile(rf"\b(?:at|near|inside)\s+(?:the\s+)?({_NAME})")
_IN_PLACE = re.compile(rf"\bin\s+({_NAME})")
_NOT_PLACES = {"The", "This", "Our", "Your", "My", "A", "An", "PM", "AM"}


def _strip_markdown(text: str) -> str:
    text = _MD_IMAGE.sub("", text)
    text = _MD_LINK.sub(r"\1", text)
    text = text.replace("\\_", "_")
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def extract_caption(source_url: str, raw_text: str) -> str | None:
    """Return the author's caption (Instagram) or bounded page text (other
    hosts). None means the caption could not be separated from the page —
    the caller must ask for clarification rather than guess."""
    host = (urlparse(source_url).hostname or "").lower()
    if host == "instagram.com" or host.endswith(".instagram.com"):
        header = _IG_TIMESTAMP_LINE.search(raw_text)
        if not header:
            return None
        body = raw_text[header.end():]
        end = _IG_CAPTION_END.search(body)
        caption = _strip_markdown(body[: end.start()] if end else body)
    else:
        caption = _strip_markdown(raw_text)
    caption = caption[:MAX_CAPTION_CHARS].strip()
    return caption or None


def place_candidates(caption: str) -> list[str]:
    """Propose place strings, most specific first: street addresses, then
    named places after "at/near/inside", then "in <Name>" (usually a city)."""
    found: list[tuple[int, int, str]] = []
    for match in _ADDRESS.finditer(caption):
        found.append((0, match.start(), match.group(0).rstrip(".")))
    for priority, pattern in ((1, _AT_PLACE), (2, _IN_PLACE)):
        for match in pattern.finditer(caption):
            name = match.group(1).strip(" .,!&-")
            if name and name not in _NOT_PLACES and not name.isdigit():
                found.append((priority, match.start(1), name))
    seen: set[str] = set()
    candidates: list[str] = []
    for _, _, name in sorted(found):
        key = name.lower()
        if key not in seen and len(name) >= 3:
            seen.add(key)
            candidates.append(name)
    return candidates[:MAX_PLACE_CANDIDATES]


def title_segments(title: str) -> list[str]:
    """Split a search-result title into candidate restaurant names."""
    parts = re.split(r"\s+[|–—-]\s+|\s*\|\s*", title.replace("&amp;", "&"))
    segments = []
    for part in parts:
        part = part.strip()
        # "Go Go Curry Menu Prices at 12 John St" -> "Go Go Curry"
        trimmed = re.sub(r"\s+(?:Menu\b.*|Order Online)$", "", part, flags=re.IGNORECASE).strip()
        part = trimmed if len(trimmed) >= 3 else part
        if part and part.lower() not in {s.lower() for s in segments}:
            segments.append(part)
    return segments[:5]


def base_domain(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return ".".join(host.split(".")[-2:])
