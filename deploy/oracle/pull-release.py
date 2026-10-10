#!/usr/bin/python3
"""Install only the current main commit after its Oracle workflow succeeds.

Installed once by the administrator; releases cannot replace this program.
No GitHub/SSH/Gemini credentials are given to downloaded build dependencies.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request

REPO = "CristianYJ/NUTRIBOT"
API = "https://api.github.com/repos/" + REPO
BASE = Path("/opt/nutribot")
STATE = Path("/var/lib/nutribot-deploy")
CURRENT = BASE / "current"
RELEASES = BASE / "releases"
DOMAIN = "nutribot.facheritossv.com"
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024


def download(url, limit):
    request = urllib.request.Request(url, headers={
        "User-Agent": "nutribot-oracle-deployer",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Download exceeds size limit")
    return data


def api(path):
    return json.loads(download(API + path, 4 * 1024 * 1024))


def head():
    sha = api("/git/ref/heads/main")["object"]["sha"]
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Invalid main SHA")
    return sha


def verified_asset(sha):
    runs = api("/actions/workflows/oracle.yml/runs?event=push&branch=main&status=success&head_sha=" + sha)["workflow_runs"]
    if not any(r["head_sha"] == sha and r["head_branch"] == "main"
               and r["event"] == "push" and r["conclusion"] == "success"
               and r["head_repository"]["full_name"] == REPO for r in runs):
        return None
    release = api("/releases/tags/oracle-" + sha)
    if release["draft"] or release["prerelease"] or release["target_commitish"] != sha:
        raise ValueError("Release does not match the verified commit")
    if release.get("immutable") is not True or release.get("author", {}).get("login") != "github-actions[bot]":
        raise ValueError("Expected an immutable release published by GitHub Actions")
    assets = [a for a in release["assets"] if a["name"] == "nutribot.tar.gz"]
    if len(assets) != 1:
        raise ValueError("Missing or duplicate runtime package")
    asset = assets[0]
    expected = "https://github.com/" + REPO + "/releases/download/oracle-" + sha + "/nutribot.tar.gz"
    if asset["browser_download_url"] != expected or asset["size"] > MAX_ARCHIVE:
        raise ValueError("Unexpected release asset")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", asset.get("digest") or ""):
        raise ValueError("GitHub did not provide an asset digest")
    return asset


def unpack(archive, destination, sha):
    """Validate the entire archive before writing; never trust tar permissions/links."""
    files = {}
    total = 0
    with tarfile.open(archive, "r:gz") as bundle:
        for entry in bundle:
            name = entry.name
            path = PurePosixPath(name)
            if (not entry.isfile() or path.is_absolute() or "\\" in name
                    or path.as_posix() != name or name in files
                    or any(p in {"..", "node_modules"} or p.startswith(".") for p in path.parts)
                    or not (name in {"package.json", "package-lock.json", "RELEASE.json"}
                            or path.parts[0] in {"dist", "server", "src"})
                    or path.suffix.lower() in {".env", ".key", ".pem", ".dump", ".db", ".sqlite"}):
                raise ValueError("Unsafe archive entry")
            total += entry.size
            if total > MAX_EXPANDED or len(files) >= 10000:
                raise ValueError("Expanded package exceeds limit")
            files[name] = bundle.extractfile(entry).read()
    manifest = json.loads(files.pop("RELEASE.json"))
    hashes = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
    if manifest.get("commit") != sha or manifest.get("files") != hashes:
        raise ValueError("Release manifest mismatch")
    if not {"dist/index.html", "server/index.js", "server/database.js", "package.json", "package-lock.json"} <= files.keys():
        raise ValueError("Incomplete runtime package")
    for name, data in files.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (destination / "RELEASE.json").write_text(json.dumps(manifest))


def database_files(root):
    paths = [root / "server/database.js", *sorted((root / "server/postgres").rglob("*"))]
    return {p.relative_to(root).as_posix(): p.read_bytes().replace(b"\r\n", b"\n")
            for p in paths if p.is_file()}


def migration_guard(old, new):
    if database_files(old) != database_files(new):
        raise ValueError("Database code/migrations changed: manual review and deployment required")


def command(args, **kwargs):
    return subprocess.run(args, check=True, timeout=kwargs.pop("timeout", 180), **kwargs)


def health():
    try:
        result = command(["/usr/bin/curl", "--fail", "--silent", "--show-error", "--max-time", "8",
                          "--noproxy", "*", "--resolve", DOMAIN + ":443:127.0.0.1",
                          "https://" + DOMAIN + "/api/health"], capture_output=True)
        return json.loads(result.stdout).get("database") == "postgresql"
    except (subprocess.SubprocessError, ValueError):
        return False


def ready():
    for _ in range(15):
        if health():
            return
        time.sleep(2)
    raise RuntimeError("HTTPS/database health check failed")


def save_state(state):
    temporary = STATE / "state.json.tmp"
    temporary.write_text(json.dumps(state))
    with temporary.open("rb") as handle:
        os.fsync(handle.fileno())
    temporary.replace(STATE / "state.json")


def switch(target):
    link = BASE / ".current-next"
    if link.is_symlink():
        link.unlink()
    link.symlink_to(target, target_is_directory=True)
    link.replace(CURRENT)


def rollback(state):
    previous = Path(state["pending"]["previous"])
    if previous.parent != RELEASES or not previous.is_dir():
        raise ValueError("Invalid rollback target")
    switch(previous)
    command(["/usr/bin/systemctl", "restart", "nutribot"])
    ready()
    state["failed"] = state["pending"]["sha"]
    manifest = previous / "RELEASE.json"
    restored = json.loads(manifest.read_text()).get("commit") if manifest.exists() else None
    state["deployed"] = restored if isinstance(restored, str) and re.fullmatch(r"[0-9a-f]{40}", restored) else None
    state["active_path"] = str(previous)
    del state["pending"]
    save_state(state)
    print("Previous version restored; failed commit will not be retried automatically", flush=True)


def activate(target, sha, state):
    previous = CURRENT.resolve()
    if not CURRENT.is_symlink():
        previous = RELEASES / ("initial-" + str(time.time_ns()))
        CURRENT.rename(previous)
        try:
            CURRENT.symlink_to(previous, target_is_directory=True)
        except BaseException:
            previous.rename(CURRENT)
            raise
    state["pending"] = {"sha": sha, "previous": str(previous)}
    save_state(state)
    try:
        switch(target)
        command(["/usr/bin/systemctl", "restart", "nutribot"])
        ready()
    except BaseException:
        rollback(state)
        raise
    state.update({"deployed": sha, "previous": str(previous), "active_path": str(target), "failed": None})
    del state["pending"]
    save_state(state)


def backup(sha):
    folder = STATE / "backups"
    folder.mkdir(mode=0o700, exist_ok=True)
    path = folder / ("before-" + sha + "-" + str(time.time_ns()) + ".dump")
    with path.open("xb") as output:
        command(["/usr/sbin/runuser", "-u", "postgres", "--", "/usr/pgsql-18/bin/pg_dump",
                 "--format=custom", "--no-owner", "--no-privileges", "--dbname=nutribot_project"], stdout=output)
    command(["/usr/pgsql-18/bin/pg_restore", "--list", str(path)], stdout=subprocess.DEVNULL)


def deploy():
    import fcntl
    import pwd
    if os.geteuid() != 0:
        raise ValueError("Run through sudo/systemd")
    os.umask(0o077)
    STATE.mkdir(mode=0o700, exist_ok=True)
    RELEASES.mkdir(mode=0o755, exist_ok=True)
    lock = (STATE / "lock").open("w")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    file = STATE / "state.json"
    state = json.loads(file.read_text()) if file.exists() else {}
    if state.get("pending"):
        rollback(state)
    if "--rollback" in sys.argv:
        previous = Path(state["previous"])
        if previous.parent != RELEASES or not previous.is_dir():
            raise ValueError("No valid previous release")
        # Pause the timer first. Keep a failed marker to avoid redeploying this SHA.
        state["pending"] = {"previous": str(previous), "sha": state.get("deployed")}
        save_state(state)
        rollback(state)
        return
    sha = head()
    if sha in {state.get("deployed"), state.get("failed")}:
        print("No new eligible commit", flush=True)
        return
    asset = verified_asset(sha)
    if asset is None:
        print("Waiting for successful main workflow", flush=True)
        return
    if shutil.disk_usage(BASE).free < 1024 * 1024 * 1024:
        raise ValueError("Less than 1 GiB free; preserve releases/backups and review disk usage")
    ready()
    with tempfile.TemporaryDirectory(prefix="nutribot-download-", dir=STATE) as temporary:
        archive = Path(temporary) / "release.tar.gz"
        data = download(asset["browser_download_url"], MAX_ARCHIVE)
        if "sha256:" + hashlib.sha256(data).hexdigest() != asset["digest"]:
            raise ValueError("GitHub release digest mismatch")
        archive.write_bytes(data)
        target = Path(tempfile.mkdtemp(prefix=sha + "-", dir=RELEASES))
        unpack(archive, target, sha)
    try:
        migration_guard(CURRENT, target)
    except ValueError:
        state["failed"] = sha
        save_state(state)
        raise
    builder = pwd.getpwnam("nutribot-build")
    for path in [target, *target.rglob("*")]:
        os.chown(path, builder.pw_uid, builder.pw_gid)
        os.chmod(path, 0o700 if path.is_dir() else 0o600)
    command(["/usr/sbin/runuser", "-u", "nutribot-build", "--", "/usr/bin/env", "-i",
             "PATH=/usr/local/bin:/usr/bin:/bin", "HOME=" + str(target), "NODE_ENV=production",
             "/usr/bin/npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund",
             "--cache", str(target / ".npm-cache")], cwd=target, timeout=300)
    # npm may create internal executable symlinks; do not follow links while securing ownership.
    for path in [target, *target.rglob("*")]:
        os.chown(path, 0, 0, follow_symlinks=False)
        if not path.is_symlink():
            os.chmod(path, 0o755 if path.is_dir() else 0o644)
    command(["/usr/sbin/restorecon", "-RF", str(target)])
    if head() != sha:
        print("main advanced while preparing; keeping current version", flush=True)
        return
    backup(sha)
    if head() != sha:
        print("main advanced during backup; keeping current version", flush=True)
        return
    activate(target, sha, state)
    print("Deployed " + sha + "; HTTPS and PostgreSQL OK", flush=True)


if __name__ == "__main__":
    try:
        deploy()
    except Exception as error:
        # No credentials are used by this process. Do not dump response bodies/configurations.
        print("Deployment stopped: " + str(error), file=sys.stderr)
        sys.exit(1)
