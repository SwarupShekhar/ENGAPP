"""Yield complete spoken sentences from a token/text stream."""
from __future__ import annotations

import re
from collections.abc import AsyncIterator, Iterator
from typing import Callable

# Boundary: ellipsis or single . ! ? followed by whitespace or end-of-buffer.
_BOUNDARY_RE = re.compile(r"(?:\.{3}|[.!?])(?=\s|$)")
_ABBREV_TAILS = frozenset(
    {
        "mr",
        "mrs",
        "ms",
        "dr",
        "prof",
        "sr",
        "jr",
        "vs",
        "etc",
        "i.e",
        "e.g",
    }
)


def sanitize_maya_sentence(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[*_`#]+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _period_is_abbreviation(buffer: str, period_index: int) -> bool:
    before = buffer[:period_index].rstrip()
    if not before:
        return False
    if before.lower().endswith(("i.e", "e.g")):
        return True
    last_token = before.split()[-1].lower().rstrip(".")
    return last_token in _ABBREV_TAILS


def find_sentence_boundary(buffer: str) -> re.Match[str] | None:
    """First valid sentence end in buffer, skipping abbreviation periods."""
    for match in _BOUNDARY_RE.finditer(buffer):
        token = match.group()
        if token == "..." or token.startswith("..."):
            return match
        if token == "." and _period_is_abbreviation(buffer, match.start()):
            continue
        return match
    return None


def iter_sentences_from_buffer(
    buffer: str,
    *,
    max_sentences: int,
    sanitize: Callable[[str], str] = sanitize_maya_sentence,
    min_words_tail: int = 6,
) -> tuple[list[str], str]:
    """Split buffer into complete sentences; return (sentences, remainder)."""
    emitted: list[str] = []
    while buffer and len(emitted) < max_sentences:
        match = find_sentence_boundary(buffer)
        if not match:
            break
        sentence = sanitize(buffer[: match.end()].strip())
        buffer = buffer[match.end() :]
        if sentence:
            emitted.append(sentence)
    return emitted, buffer


def finalize_tail(
    buffer: str,
    *,
    emitted_count: int,
    max_sentences: int,
    sanitize: Callable[[str], str] = sanitize_maya_sentence,
    min_words_tail: int = 6,
) -> str | None:
    """Emit a trailing fragment only when it is a complete spoken sentence.

    Incomplete tails (e.g. "Hello Roberto, I") must never reach the UI — they
    look like stuck/truncated replies. Word-count alone is not enough.
    ``min_words_tail`` is retained for API compatibility but ignored.
    """
    del min_words_tail  # complete punctuation is the only safe gate
    if not buffer.strip() or emitted_count >= max_sentences:
        return None
    tail = sanitize(buffer.strip())
    if tail and tail[-1] in ".!?":
        return tail
    return None


async def stream_sentences_from_async_tokens(
    token_stream: AsyncIterator[str],
    *,
    max_sentences: int = 4,
    sanitize: Callable[[str], str] = sanitize_maya_sentence,
) -> AsyncIterator[str]:
    buffer = ""
    emitted = 0
    async for delta in token_stream:
        if not delta:
            continue
        buffer += delta
        new_sentences, buffer = iter_sentences_from_buffer(
            buffer, max_sentences=max_sentences - emitted, sanitize=sanitize
        )
        for sentence in new_sentences:
            yield sentence
            emitted += 1
            if emitted >= max_sentences:
                return

    tail = finalize_tail(
        buffer,
        emitted_count=emitted,
        max_sentences=max_sentences,
        sanitize=sanitize,
    )
    if tail:
        yield tail


def iter_sentences_from_sync_tokens(
    token_iter: Iterator[str],
    *,
    max_sentences: int = 4,
    sanitize: Callable[[str], str] = sanitize_maya_sentence,
) -> Iterator[str]:
    buffer = ""
    emitted = 0
    for delta in token_iter:
        if not delta:
            continue
        buffer += delta
        new_sentences, buffer = iter_sentences_from_buffer(
            buffer, max_sentences=max_sentences - emitted, sanitize=sanitize
        )
        for sentence in new_sentences:
            yield sentence
            emitted += 1
            if emitted >= max_sentences:
                return

    tail = finalize_tail(
        buffer,
        emitted_count=emitted,
        max_sentences=max_sentences,
        sanitize=sanitize,
    )
    if tail:
        yield tail
