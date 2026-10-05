"""Backblaze B2 object storage helpers using its S3-compatible API.

When B2 credentials are absent, the application keeps using local uploads for
development. Stored B2 paths use the stable form ``b2://bucket/key``.
"""
import os
import tempfile
from functools import lru_cache
from pathlib import Path

from app.core.config import settings


def enabled() -> bool:
    return bool(settings.B2_ENDPOINT_URL and settings.B2_BUCKET and settings.B2_KEY_ID and settings.B2_APPLICATION_KEY)


@lru_cache(maxsize=1)
def _client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=settings.B2_ENDPOINT_URL,
        region_name=settings.B2_REGION,
        aws_access_key_id=settings.B2_KEY_ID,
        aws_secret_access_key=settings.B2_APPLICATION_KEY,
    )


def upload_fileobj(fileobj, key: str, content_type: str | None = None) -> str:
    extra = {"ContentType": content_type} if content_type else None
    _client().upload_fileobj(fileobj, settings.B2_BUCKET, key, ExtraArgs=extra or {})
    return f"b2://{settings.B2_BUCKET}/{key}"


def upload_file(path: str, key: str, content_type: str | None = None) -> str:
    with open(path, "rb") as source:
        return upload_fileobj(source, key, content_type)


def _parse(storage_path: str):
    if not storage_path.startswith("b2://"):
        return None
    bucket, _, key = storage_path[5:].partition("/")
    if not bucket or not key:
        raise ValueError(f"Invalid B2 object path: {storage_path}")
    return bucket, key


def local_path(storage_path: str) -> str:
    """Return local paths directly; fetch B2 objects into a worker-local cache."""
    parsed = _parse(storage_path)
    if not parsed:
        return storage_path
    bucket, key = parsed
    cache_dir = Path(tempfile.gettempdir()) / "harvest-b2-cache"
    target = cache_dir / key
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = str(target) + ".part"
        _client().download_file(bucket, key, temporary)
        os.replace(temporary, target)
    return str(target)


def url(storage_path: str) -> str:
    """Create a time-limited URL for browser playback or external fetchers."""
    parsed = _parse(storage_path)
    if not parsed:
        return storage_path
    bucket, key = parsed
    return _client().generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key},
        ExpiresIn=settings.B2_PRESIGNED_URL_TTL,
    )


def delete(storage_path: str) -> None:
    parsed = _parse(storage_path)
    if parsed:
        _client().delete_object(Bucket=parsed[0], Key=parsed[1])
    elif storage_path and os.path.isfile(storage_path):
        os.remove(storage_path)
