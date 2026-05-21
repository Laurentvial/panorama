from __future__ import annotations

import gzip
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

import boto3
from botocore.config import Config
from django.core.management.base import BaseCommand, CommandError


def _first_env_value(*names: str, default: str = "") -> str:
    for name in names:
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return default


def _env_to_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Command(BaseCommand):
    help = "Dump PostgreSQL database and upload compressed backup to S3."

    def add_arguments(self, parser):
        parser.add_argument(
            "--prefix",
            default=os.getenv("DB_BACKUP_S3_PREFIX", "database-backups"),
            help="S3 key prefix for backup files.",
        )
        parser.add_argument(
            "--pg-dump-bin",
            default=os.getenv("DB_BACKUP_PG_DUMP_BIN", "pg_dump"),
            help="Path or binary name used to execute pg_dump.",
        )
        parser.add_argument(
            "--compress-level",
            type=int,
            default=int(os.getenv("DB_BACKUP_COMPRESS_LEVEL", "6")),
            help="Gzip compression level (0-9).",
        )

    def handle(self, *args, **options):
        database_url = (os.getenv("DATABASE_URL") or "").strip()
        if not database_url:
            raise CommandError("DATABASE_URL is required to run database backup.")

        parsed = urlparse(database_url)
        if parsed.scheme not in {"postgres", "postgresql"}:
            raise CommandError("DATABASE_URL must be a PostgreSQL URL.")

        host = parsed.hostname
        port = parsed.port or 5432
        database_name = (parsed.path or "").lstrip("/")
        username = unquote(parsed.username or "")
        password = unquote(parsed.password or "")

        if not all([host, database_name, username, password]):
            raise CommandError("DATABASE_URL is missing host, db name, username or password.")

        bucket = _first_env_value("DB_BACKUP_S3_BUCKET")
        if not bucket:
            raise CommandError("DB_BACKUP_S3_BUCKET is required. No fallback to app media bucket is allowed.")

        access_key = _first_env_value("DB_BACKUP_S3_ACCESS_KEY_ID")
        secret_key = _first_env_value("DB_BACKUP_S3_SECRET_ACCESS_KEY")
        if not access_key or not secret_key:
            raise CommandError(
                "DB_BACKUP_S3_ACCESS_KEY_ID and DB_BACKUP_S3_SECRET_ACCESS_KEY are required. "
                "No fallback to app media credentials is allowed."
            )

        endpoint_url = _first_env_value("DB_BACKUP_S3_ENDPOINT")
        region_name = _first_env_value("DB_BACKUP_S3_REGION", default="us-east-1")
        force_path_style = _env_to_bool(os.getenv("DB_BACKUP_S3_FORCE_PATH_STYLE"), default=False)
        prefix = (options["prefix"] or "database-backups").strip().strip("/")
        compress_level = max(0, min(9, int(options["compress_level"])))
        pg_dump_bin = options["pg_dump_bin"]

        now = datetime.now(timezone.utc)
        timestamp = now.strftime("%Y%m%dT%H%M%SZ")
        file_name = f"{database_name}-{timestamp}.sql.gz"
        s3_key = f"{prefix}/{file_name}" if prefix else file_name

        self.stdout.write(f"Starting PostgreSQL backup upload to s3://{bucket}/{s3_key}")

        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".sql.gz", delete=False) as temp_file:
                temp_path = Path(temp_file.name)

            dump_cmd = [
                pg_dump_bin,
                "--no-owner",
                "--no-acl",
                "--host",
                host,
                "--port",
                str(port),
                "--username",
                username,
                database_name,
            ]
            dump_env = os.environ.copy()
            dump_env["PGPASSWORD"] = password

            with temp_path.open("wb") as backup_file:
                process = subprocess.Popen(
                    dump_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=dump_env,
                )
                assert process.stdout is not None
                with gzip.GzipFile(fileobj=backup_file, mode="wb", compresslevel=compress_level) as gzip_file:
                    shutil.copyfileobj(process.stdout, gzip_file)
                stderr_output = (process.stderr.read() if process.stderr else b"").decode("utf-8", errors="replace")
                return_code = process.wait()

            if return_code != 0:
                raise CommandError(f"pg_dump failed with exit code {return_code}: {stderr_output.strip()}")

            s3_client = boto3.client(
                "s3",
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name=region_name,
                endpoint_url=endpoint_url or None,
                config=Config(s3={"addressing_style": "path" if force_path_style else "auto"}),
            )
            s3_client.upload_file(str(temp_path), bucket, s3_key)

            file_size = temp_path.stat().st_size
            self.stdout.write(
                self.style.SUCCESS(
                    f"Backup uploaded successfully ({file_size} bytes) to s3://{bucket}/{s3_key}"
                )
            )
        except FileNotFoundError as exc:
            raise CommandError(
                f"pg_dump binary not found ({pg_dump_bin}). Install PostgreSQL client or set DB_BACKUP_PG_DUMP_BIN."
            ) from exc
        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink(missing_ok=True)
