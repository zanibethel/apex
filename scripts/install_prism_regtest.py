#!/usr/bin/env python3
"""CI-only installation of a pinned, published Prism plugin archive.

Only use in disposable Bitcoin regtest GitHub runner. Never run on production.
Untrusted plugin archives execute arbitrary .NET code when loaded; use only the
intended publisher and check package integrity/compatibility separately.
"""
import os
import pathlib
import re
import sys
import zipfile

PLUGIN = "BTCPayServer.Plugins.Prism"
VERSION = "1.3.3"
LIMIT = 80 * 1024 * 1024


def prepare_package(package: pathlib.Path, destination: pathlib.Path):
    if os.environ.get("CI") != "true" or os.environ.get("APEX_BTCPAY_EPHEMERAL") != "true" or os.environ.get("APEX_BTCPAY_TEST_NETWORK") != "regtest":
        raise RuntimeError("STOP: Prism package loader is CI-only, regtest-only")
    if not package.is_file() or package.stat().st_size > LIMIT:
        raise RuntimeError("Missing or oversized published Prism plugin archive")
    if destination.exists():
        raise RuntimeError("Refusing to overwrite an existing plugin directory")
    with zipfile.ZipFile(package) as archive:
        items = archive.infolist()
        if not items or sum(item.file_size for item in items) > LIMIT:
            raise RuntimeError("Missing or expanded-over-limit Prism package")
        seen = set()
        for item in items:
            name = item.filename.replace("\\", "/")
            path = pathlib.PurePosixPath(name)
            if not name or path.is_absolute() or ".." in path.parts or name.startswith("/") or ":" in name or item.is_dir() and not name.endswith("/"):
                raise RuntimeError("Unsafe Prism archive file path")
            if (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise RuntimeError("Symbolic links are not permitted")
            if name.lower() in seen:
                raise RuntimeError("Duplicate archive path")
            seen.add(name.lower())
        expected = PLUGIN + ".dll"
        if expected not in seen and expected.lower() not in seen:
            raise RuntimeError("Prism plugin assembly not found at package root")
        destination.mkdir(parents=True, exist_ok=False)
        archive.extractall(destination)
    assembly = destination / (PLUGIN + ".dll")
    if not assembly.is_file() or assembly.stat().st_size < 10000:
        raise RuntimeError("Expected compiled Prism assembly missing")
    print("Prism package extracted for disposable GitHub-hosted regtest instance")
    return assembly


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: install_prism_regtest.py <published.btcpay> <empty-plugin-directory>")
    try:
        prepare_package(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
    except Exception as exc:
        print("FAIL: " + str(exc), file=sys.stderr)
        raise SystemExit(1)
