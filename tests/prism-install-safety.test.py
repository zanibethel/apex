import importlib.util
import os
import pathlib
import tempfile
import unittest
import zipfile

script = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "install_prism_regtest.py"
spec = importlib.util.spec_from_file_location("regtest_prism_installer", script)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class PrismInstallSafety(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.archive = self.root / "prism.btcpay"
        self.destination = self.root / "extracted"
        self.before = {k: os.environ.get(k) for k in
                       ("CI", "APEX_BTCPAY_EPHEMERAL", "APEX_BTCPAY_TEST_NETWORK")}
        os.environ.update({"CI": "true", "APEX_BTCPAY_EPHEMERAL": "true",
                           "APEX_BTCPAY_TEST_NETWORK": "regtest"})
        self.addCleanup(self.restore)

    def restore(self):
        for k, v in self.before.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def write(self, files=None):
        if files is None:
            files = {"BTCPayServer.Plugins.Prism.dll": b"X" * 11000}
        with zipfile.ZipFile(self.archive, "w", zipfile.ZIP_DEFLATED) as arc:
            for name, contents in files.items():
                arc.writestr(name, contents)

    def test_expected_assembly(self):
        self.write()
        actual = mod.prepare_package(self.archive, self.destination)
        self.assertEqual(actual.name, "BTCPayServer.Plugins.Prism.dll")
        self.assertTrue(actual.is_file())

    def test_non_regtest_never_extracts(self):
        self.write()
        for env in (("CI", "false"), ("APEX_BTCPAY_EPHEMERAL", "false"),
                    ("APEX_BTCPAY_TEST_NETWORK", "mainnet")):
            original = os.environ[env[0]]
            os.environ[env[0]] = env[1]
            with self.assertRaisesRegex(RuntimeError, "CI-only"):
                mod.prepare_package(self.archive, self.destination)
            os.environ[env[0]] = original
        self.assertFalse(self.destination.exists())

    def test_reject_archive_path_traversal(self):
        self.write({"../../unsafe": b"a", "BTCPayServer.Plugins.Prism.dll": b"X"*11000})
        with self.assertRaisesRegex(RuntimeError, "Unsafe"):
            mod.prepare_package(self.archive, self.destination)
        self.assertFalse((self.root.parent / "unsafe").exists())

    def test_reject_wrong_assembly_and_existing_directory(self):
        self.write({"OtherPlugin.dll": b"X"*11000})
        with self.assertRaisesRegex(RuntimeError, "assembly"):
            mod.prepare_package(self.archive, self.destination)
        self.write()
        self.destination.mkdir()
        with self.assertRaisesRegex(RuntimeError, "overwrite"):
            mod.prepare_package(self.archive, self.destination)


if __name__ == "__main__":
    unittest.main()
