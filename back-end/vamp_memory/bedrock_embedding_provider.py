"""Bedrock Titan Text Embeddings V2 provider for VAMP memory bullets.

This module is the embedding adapter used by ``VampMemoryService`` to convert
memory bullet text into dense vectors before upserting them into Qdrant.

The provider function (``default_embedding_provider``) is intentionally
*lazy-imported* (the ``boto3``/Bedrock client is constructed on first call) so
that unit tests and deployments without embedding credentials can import the
VAMP service module safely — module-level import would fail at app startup in
those environments.

Configuration
-------------
* ``VAMP_EMBEDDING_MODEL``      -- Bedrock model id (e.g.
                                  ``amazon.titan-embed-text-v2:0``).
* ``VAMP_EMBEDDING_DIMENSIONS`` -- output vector dimensionality (passed to
                                  Titan v2's ``dimensions`` request field).
                                  Must match the Qdrant collection's
                                  ``vector_size`` (validated in
                                  ``qdrant_vector_store.ensure_ready``).

Error semantics
---------------
Raises ``ValueError`` if the model is not configured or the response is
malformed. Network / AWS errors propagate from ``boto3`` as
``botocore.exceptions.ClientError``. The caller (``VampMemoryService``)
translates any exception into a ``mark_vector_failed`` call so the block
enters the retry/dead-state pipeline (see ``summary_block_repository.py``).
"""

from config import get_config

DEFAULT_EMBEDDING_MODEL = get_config().VAMP_EMBEDDING_MODEL


def default_embedding_provider(text: str) -> list[float]:
    """Generate an embedding using Bedrock Titan Text Embeddings V2.

    Lazy-imports ``boto3``/Bedrock so unit tests and deployments without
    embedding credentials can import the service safely. Returns a list of
    floats of length ``VAMP_EMBEDDING_DIMENSIONS``. Raises ``ValueError`` if
    the model is not configured or the response is malformed; propagates
    ``botocore.exceptions.ClientError`` on AWS/network failures.
    """
    import json

    from llm_provider.bedrock_client import get_bedrock_client

    client = get_bedrock_client()
    model_id = get_config().VAMP_EMBEDDING_MODEL
    if not model_id:
        raise ValueError("VAMP_EMBEDDING_MODEL is not configured in settings/environment")

    request_body: dict[str, str | int | bool] = {"inputText": text}
    if "titan-embed-text-v2" in model_id:
        request_body.update(
            {
                "dimensions": get_config().VAMP_EMBEDDING_DIMENSIONS,
                "normalize": True,
            }
        )

    response = client.invoke_model(
        modelId=model_id,
        body=json.dumps(request_body),
        accept="application/json",
        contentType="application/json",
    )
    body = json.loads(response["body"].read())
    embedding = body.get("embedding")
    if not isinstance(embedding, list):
        raise ValueError("Bedrock embedding response did not include an embedding")
    return embedding
