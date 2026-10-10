import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch

SCRIPTS = Path(__file__).resolve().parents[1]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


deploy = module("deploy", "pull-release.py")
package = module("package", "package-release.py")
SHA = "a" * 40


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)

    def inputs(self):
        root = self.root / "source"
        for name in ["dist/index.html", "server/index.js", "server/database.js", "src/data.js",
                     "server/postgres/001.sql", "package.json", "package-lock.json"]:
            file = root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("{}")
        return root

    def archive(self, entries):
        archive = self.root / "bad.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            for name, data in entries:
                item = tarfile.TarInfo(name)
                if data is None:
                    item.type, item.linkname = tarfile.SYMTYPE, "/etc/nutribot/nutribot.env"
                    bundle.addfile(item)
                else:
                    item.size = len(data)
                    bundle.addfile(item, io.BytesIO(data))
        return archive

    def test_roundtrip_excludes_external_private_files(self):
        root = self.inputs()
        (root / ".env").write_text("DO_NOT_SHIP=secret")
        (root / "backup.dump").write_text("private")
        archive = self.root / "release.tar.gz"
        package.build(root, SHA, archive)
        out = self.root / "out"
        deploy.unpack(archive, out, SHA)
        self.assertTrue((out / "server/postgres/001.sql").exists())
        self.assertFalse((out / ".env").exists())
        self.assertFalse((out / "backup.dump").exists())
        self.assertEqual(json.loads((out / "RELEASE.json").read_text())["commit"], SHA)

    def test_archive_rejects_traversal_links_and_private_files_before_writing(self):
        for name, data in [("../escape", b"bad"), ("/etc/passwd", b"bad"),
                           ("server/link", None), ("server/.env", b"secret"),
                           ("src/a/../../escape", b"bad"), ("server/backup.dump", b"bad")]:
            with self.subTest(name=name):
                out = self.root / "out"
                with self.assertRaises(ValueError):
                    deploy.unpack(self.archive([(name, data)]), out, SHA)
                self.assertFalse(out.exists())

    def test_rejects_manifest_tamper_or_wrong_commit(self):
        for manifest in [{"commit": SHA, "files": {"server/index.js": "0" * 64}},
                         {"commit": "b" * 40, "files": {"server/index.js": hashlib.sha256(b"x").hexdigest()}}]:
            archive = self.archive([("server/index.js", b"x"), ("RELEASE.json", json.dumps(manifest).encode())])
            with self.assertRaisesRegex(ValueError, "manifest mismatch"):
                deploy.unpack(archive, self.root / "out", SHA)

    def test_database_guard_handles_windows_newlines_but_blocks_schema_changes(self):
        root = self.inputs()
        other = self.root / "other"
        import shutil
        shutil.copytree(root, other)
        (root / "server/database.js").write_bytes(b"code\r\n")
        (other / "server/database.js").write_bytes(b"code\n")
        deploy.migration_guard(root, other)
        (other / "server/postgres/002.sql").write_text("ALTER TABLE something")
        with self.assertRaisesRegex(ValueError, "manual review"):
            deploy.migration_guard(root, other)

    def test_package_rejects_credential_in_runtime_source(self):
        root = self.inputs()
        (root / "server/key.js").write_text('const key="AIza' + "a" * 35 + '";')
        with self.assertRaisesRegex(ValueError, "credential"):
            package.build(root, SHA, self.root / "release.tar.gz")

    def test_failed_health_restores_previous_release_and_does_not_advance_commit(self):
        releases = self.root / "releases"
        previous = releases / "old"
        previous.mkdir(parents=True)
        (previous / "RELEASE.json").write_text(json.dumps({"commit": "b" * 40}))
        current = Mock()
        current.resolve.return_value = previous
        current.is_symlink.return_value = True
        state = {"deployed": "b" * 40}
        with patch.object(deploy, "CURRENT", current), patch.object(deploy, "RELEASES", releases), \
             patch.object(deploy, "save_state"), patch.object(deploy, "switch") as switch, \
             patch.object(deploy, "command"), patch.object(deploy, "ready", side_effect=[RuntimeError("unhealthy"), None]):
            with self.assertRaisesRegex(RuntimeError, "unhealthy"):
                deploy.activate(releases / SHA, SHA, state)
        self.assertEqual([c.args[0] for c in switch.call_args_list], [releases / SHA, previous])
        self.assertEqual(state["deployed"], "b" * 40)
        self.assertEqual(state["failed"], SHA)
        self.assertNotIn("pending", state)

    def test_failed_rollback_keeps_journal_for_recovery(self):
        releases = self.root / "releases"
        previous = releases / "old"
        previous.mkdir(parents=True)
        state = {"pending": {"sha": SHA, "previous": str(previous)}}
        with patch.object(deploy, "RELEASES", releases), patch.object(deploy, "switch"), \
             patch.object(deploy, "command"), patch.object(deploy, "ready", side_effect=RuntimeError("still unhealthy")):
            with self.assertRaises(RuntimeError):
                deploy.rollback(state)
        self.assertIn("pending", state)

    def test_no_deploy_for_unverified_workflow(self):
        for runs in [[], [{"head_sha": SHA, "head_branch": "main", "event": "pull_request",
                          "conclusion": "success", "head_repository": {"full_name": deploy.REPO}}]]:
            with patch.object(deploy, "api", return_value={"workflow_runs": runs}) as api:
                self.assertIsNone(deploy.verified_asset(SHA))
                self.assertEqual(api.call_count, 1)

    def test_release_digest_and_commit_required(self):
        run = {"head_sha": SHA, "head_branch": "main", "event": "push", "conclusion": "success",
               "head_repository": {"full_name": deploy.REPO}}
        release = {"draft": False, "prerelease": False, "target_commitish": SHA,
                   "immutable": True, "author": {"login": "github-actions[bot]"},
                   "assets": [{"name": "nutribot.tar.gz", "size": 1,
                               "browser_download_url": "https://github.com/" + deploy.REPO + "/releases/download/oracle-" + SHA + "/nutribot.tar.gz"}]}
        with patch.object(deploy, "api", side_effect=[{"workflow_runs": [run]}, release]):
            with self.assertRaisesRegex(ValueError, "digest"):
                deploy.verified_asset(SHA)
        release["assets"][0]["digest"] = "sha256:" + "c" * 64
        with patch.object(deploy, "api", side_effect=[{"workflow_runs": [run]}, release]):
            self.assertEqual(deploy.verified_asset(SHA), release["assets"][0])
        for changes in [{"immutable": False}, {"author": {"login": "someone"}},
                        {"target_commitish": "b" * 40}, {"draft": True}]:
            with self.subTest(changes=changes), patch.object(deploy, "api", side_effect=[{"workflow_runs": [run]}, {**release, **changes}]):
                with self.assertRaises(ValueError):
                    deploy.verified_asset(SHA)


if __name__ == "__main__":
    unittest.main()
