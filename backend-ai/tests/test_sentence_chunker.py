from app.features.tutor.llm.sentence_chunker import (
    finalize_tail,
    iter_sentences_from_sync_tokens,
    sanitize_maya_sentence,
)


def test_sentence_chunker_emits_two_sentences():
    tokens = ["Hello there. ", "How are you today?"]
    sentences = list(iter_sentences_from_sync_tokens(iter(tokens)))
    assert len(sentences) == 2
    assert sentences[0] == "Hello there."
    assert sentences[1] == "How are you today?"


def test_sentence_chunker_ellipsis_single_boundary():
    tokens = ["Wait... ", "Then we go."]
    sentences = list(iter_sentences_from_sync_tokens(iter(tokens)))
    assert sentences == ["Wait...", "Then we go."]


def test_sentence_chunker_skips_abbreviation_period():
    tokens = ["Mr. Smith went home. ", "He was tired."]
    sentences = list(iter_sentences_from_sync_tokens(iter(tokens)))
    assert sentences == ["Mr. Smith went home.", "He was tired."]


def test_sanitize_strips_markdown():
    assert sanitize_maya_sentence("**Hello** _world_") == "Hello world"


def test_finalize_tail_rejects_incomplete_fragment():
    assert (
        finalize_tail("Hello Roberto, I", emitted_count=0, max_sentences=4) is None
    )


def test_finalize_tail_accepts_complete_sentence():
    assert (
        finalize_tail("Hello Roberto.", emitted_count=0, max_sentences=4)
        == "Hello Roberto."
    )


def test_incomplete_stream_emits_nothing():
    tokens = ["Hello Roberto, I"]
    sentences = list(iter_sentences_from_sync_tokens(iter(tokens)))
    assert sentences == []
