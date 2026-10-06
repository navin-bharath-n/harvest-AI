"""S3-compatible remote storage helpers (Cloudflare R2 and legacy Backblaze B2).

New uploads can use R2; existing ``b2://`` database paths keep working. When
remote storage is not configured, the application uses local uploads.
"""
import os
import tempfile
from functools import lru_cache
from pathlib import Path

from app.core.config import settings


def _configured(values) -> bool:
    return all(_clean_setting(value) for value in values)


def _r2_values():
    endpoint = _clean_setting(settings.R2_ENDPOINT_URL)
    account_id = _clean_setting(settings.R2_ACCOUNT_ID)
    if not endpoint and account_id:
        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    return endpoint, (
        settings.R2_REGION or "auto", _clean_setting(settings.R2_BUCKET),
        _clean_setting(settings.R2_ACCESS_KEY_ID),
        _clean_setting(settings.R2_SECRET_ACCESS_KEY),
    )


def _b2_values():
    return _clean_setting(settings.B2_ENDPOINT_URL), (
        settings.B2_ENDPOINT_URL, settings.B2_BUCKET,
        settings.B2_KEY_ID, settings.B2_APPLICATION_KEY,
    )


def _provider() -> str | None:
    selected = (settings.STORAGE_BACKEND or "auto").strip().lower()
    r2_endpoint, r2_credentials = _r2_values()
    b2_endpoint, b2_credentials = _b2_values()
    r2_ready = bool(r2_endpoint and _configured(r2_credentials))
    b2_ready = bool(b2_endpoint and _configured(b2_credentials))
    if selected == "r2":
        return "r2"
    if selected == "b2":
        return "b2"
    if selected == "local":
        return None
    if selected != "auto":
        raise ValueError("STORAGE_BACKEND must be auto, r2, b2, or local")
    return "r2" if r2_ready else ("b2" if b2_ready else None)


def enabled() -> bool:
    return _provider() is not None


def _clean_setting(value: str | None) -> str:
    """Tolerate values pasted from quoted .env examples into host dashboards."""
    return (value or "").strip().strip("\"'").strip()


@lru_cache(maxsize=1)
def _client():
    import boto3
    # boto3/botocore are only needed when remote storage is actually enabled.
    # Keeping this import lazy lets local-only installs use the API without the
    # optional B2 SDK being present.
    from botocore.config import Config

    provider = _provider()
    if provider == "r2":
        endpoint, credentials = _r2_values()
        region, bucket, key_id, application_key = credentials
    elif provider == "b2":
        endpoint, credentials = _b2_values()
        region = _clean_setting(settings.B2_REGION) or "us-east-005"
        bucket = _clean_setting(settings.B2_BUCKET)
        key_id = _clean_setting(settings.B2_KEY_ID)
        application_key = _clean_setting(settings.B2_APPLICATION_KEY)
    else:
        raise RuntimeError("Remote storage is not configured")
    if not endpoint or not all((region, bucket, key_id, application_key)):
        raise RuntimeError(f"{provider.upper()} storage is selected but its credentials/settings are incomplete")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=key_id,
        aws_secret_access_key=application_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual" if provider == "r2" else "path"},
            connect_timeout=20,
            read_timeout=300,
            retries={"mode": "standard", "max_attempts": 5},
        ),
    )


def upload_fileobj(fileobj, key: str, content_type: str | None = None) -> str:
    from boto3.s3.transfer import TransferConfig

    provider = _provider()
    bucket = _r2_values()[1][1] if provider == "r2" else _clean_setting(settings.B2_BUCKET)
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
    return f"{provider}://{bucket}/{key}"


def upload_file(path: str, key: str, content_type: str | None = None) -> str:
    with open(path, "rb") as source:
        return upload_fileobj(source, key, content_type)


def _parse(storage_path: str):
    if not storage_path.startswith(("b2://", "r2://")):
        return None
    provider, remainder = storage_path.split("://", 1)
    bucket, _, key = remainder.partition("/")
    if not bucket or not key:
        raise ValueError(f"Invalid remote object path: {storage_path}")
    return provider, bucket, key


def is_remote(storage_path: str | None) -> bool:
    return bool(storage_path and storage_path.startswith(("b2://", "r2://")))


def local_path(storage_path: str) -> str:
    """Return local paths directly; fetch remote objects into a worker-local cache."""
    parsed = _parse(storage_path)
    if not parsed:
        return storage_path
    provider, bucket, key = parsed
    cache_dir = Path(tempfile.gettempdir()) / f"harvest-{provider}-cache" / bucket
    target = cache_dir / key
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = str(target) + ".part"
        _client_for(provider).download_file(bucket, key, temporary)
        os.replace(temporary, target)
    return str(target)


def url(storage_path: str) -> str:
    """Create a time-limited URL for browser playback or external fetchers."""
    parsed = _parse(storage_path)
    if not parsed:
        return storage_path
    provider, bucket, key = parsed
    ttl = (settings.STORAGE_PRESIGNED_URL_TTL if provider == "r2"
           else settings.B2_PRESIGNED_URL_TTL)
    return _client_for(provider).generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key},
        ExpiresIn=ttl,
    )


def open_read(storage_path: str):
    """Open a remote object body for same-origin API streaming to browsers."""
    parsed = _parse(storage_path)
    if not parsed:
        raise ValueError("A remote storage path is required")
    provider, bucket, key = parsed
    return _client_for(provider).get_object(Bucket=bucket, Key=key)


def delete(storage_path: str) -> None:
    parsed = _parse(storage_path)
    if parsed:
        provider, bucket, key = parsed
        _client_for(provider).delete_object(Bucket=bucket, Key=key)
    elif storage_path and os.path.isfile(storage_path):
        os.remove(storage_path)


@lru_cache(maxsize=2)
def _client_for(provider: str):
    """Return the cached client for a stored provider (including old B2 files)."""
    if provider == _provider():
        return _client()
    import boto3
    from botocore.config import Config

    if provider == "b2":
        endpoint, credentials = _b2_values()
        region = _clean_setting(settings.B2_REGION) or "us-east-005"
        bucket = _clean_setting(settings.B2_BUCKET)
        key_id = _clean_setting(settings.B2_KEY_ID)
        secret = _clean_setting(settings.B2_APPLICATION_KEY)
    elif provider == "r2":
        endpoint, credentials = _r2_values()
        region, bucket, key_id, secret = credentials
    else:
        raise ValueError(f"Unknown storage provider: {provider}")
    return boto3.client(
        "s3", endpoint_url=endpoint, region_name=region,
        aws_access_key_id=key_id, aws_secret_access_key=secret,
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual" if provider == "r2" else "path"},
                      connect_timeout=20, read_timeout=300,
                      retries={"mode": "standard", "max_attempts": 5}),
    )
