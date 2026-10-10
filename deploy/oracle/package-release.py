"""Build the public runtime package. Never package the workspace recursively."""
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[2]
ALLOWED = {"dist", "server", "src"}
SECRET = re.compile(rb"AIza[0-9A-Za-z_-]{35}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}")


def build(root, commit, destination):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Expected a full Git commit SHA")
    files = {}
    for top in ["package.json", "package-lock.json", *sorted(ALLOWED)]:
        path = root / top
        if not path.exists():
            raise ValueError("Missing runtime input: " + top)
        for item in ([path] if path.is_file() else sorted(path.rglob("*"))):
            name = item.relative_to(root).as_posix()
            if item.is_symlink():
                raise ValueError("Symlink forbidden: " + name)
            if item.is_dir():
                continue
            if any(p.startswith(".") or p == "node_modules" for p in Path(name).parts):
                raise ValueError("Hidden/runtime dependency file forbidden: " + name)
            if item.suffix.lower() in {".env", ".dump", ".key", ".pem", ".sqlite", ".db"}:
                raise ValueError("Private file forbidden: " + name)
            data = item.read_bytes()
            if SECRET.search(data):
                raise ValueError("Possible credential in: " + name)
            files[name] = data
    manifest = {"commit": commit, "files": {n: hashlib.sha256(b).hexdigest() for n, b in files.items()}}
    files["RELEASE.json"] = json.dumps(manifest, sort_keys=True).encode()
    with tarfile.open(destination, "w:gz") as archive:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(data), 0o644, 0
            archive.addfile(info, io.BytesIO(data))
    print("Runtime package created; commit=" + commit)


if __name__ == "__main__":
    build(ROOT, sys.argv[1], Path(sys.argv[2]))
