"""Backblaze B2 object storage helpers using its S3-compatible API.

When B2 credentials are absent, the application keeps using local uploads for
development. Stored B2 paths use the stable form ``b2://bucket/key``.
"""
import os
import tempfile
from functools import lru_cache
from pathlib import Path

from botocore.config import Config

from app.core.config import settings


def enabled() -> bool:
    return all(_clean_setting(value) for value in (
        settings.B2_ENDPOINT_URL, settings.B2_BUCKET,
        settings.B2_KEY_ID, settings.B2_APPLICATION_KEY,
    ))


def _clean_setting(value: str | None) -> str:
    """Tolerate values pasted from quoted .env examples into host dashboards."""
    return (value or "").strip().strip("\"'").strip()


@lru_cache(maxsize=1)
def _client():
    import boto3
    endpoint = _clean_setting(settings.B2_ENDPOINT_URL)
    region = _clean_setting(settings.B2_REGION) or "us-east-005"
    bucket = _clean_setting(settings.B2_BUCKET)
    key_id = _clean_setting(settings.B2_KEY_ID)
    application_key = _clean_setting(settings.B2_APPLICATION_KEY)
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=key_id,
        aws_secret_access_key=application_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=20,
            read_timeout=300,
            retries={"mode": "standard", "max_attempts": 5},
        ),
    )


def upload_fileobj(fileobj, key: str, content_type: str | None = None) -> str:
    from boto3.s3.transfer import TransferConfig

    bucket = _clean_setting(settings.B2_BUCKET)
    extra = {"ContentType": content_type} if content_type else None
    transfer_config = TransferConfig(
        multipart_threshold=32 * 1024 * 1024,
        multipart_chunksize=64 * 1024 * 1024,
        max_concurrency=1,
        use_threads=False,
    )
    _client().upload_fileobj(
        fileobj,
        bucket,
        key,
        ExtraArgs=extra or {},
        Config=transfer_config,
    )
    return f"b2://{bucket}/{key}"


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
