from app.features.tutor.llm.sentence_chunker import (
    iter_sentences_from_sync_tokens,
    sanitize_maya_sentence,
)


def test_sentence_chunker_emits_two_sentences():
    tokens = ["Hello there. ", "How are you today?"]
    sentences = list(iter_sentences_from_sync_tokens(iter(tokens)))
    assert len(sentences) == 2
    assert sentences[0] == "Hello there."
    assert sentences[1] == "How are you today?"


def test_sanitize_strips_markdown():
    assert sanitize_maya_sentence("**Hello** _world_") == "Hello world"
