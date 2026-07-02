"""Yield complete spoken sentences from a token/text stream."""
from __future__ import annotations

import re
from collections.abc import AsyncIterator, Iterator
from typing import Callable

SENTENCE_END = re.compile(r"[.!?]\s*")
DEFAULT_SANITIZE = lambda t: t  # noqa: E731


def sanitize_maya_sentence(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[*_`#]+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


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
        match = SENTENCE_END.search(buffer)
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
    if not buffer.strip() or emitted_count >= max_sentences:
        return None
    tail = sanitize(buffer.strip())
    word_count = len(tail.split())
    if tail and (tail[-1] in ".!?" or word_count >= min_words_tail):
        return tail
    return None


async def stream_sentences_from_async_tokens(
    token_stream: AsyncIterator[str],
    *,
    max_sentences: int = 2,
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
    max_sentences: int = 2,
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
