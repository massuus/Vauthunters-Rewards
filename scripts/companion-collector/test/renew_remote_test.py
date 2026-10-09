"""Linux-only renewal tests. Uses temporary files and mocked services, no real login."""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import time
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('renew', Path(__file__).parents[1] / 'renew-remote.py')
renew = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renew)


class RenewalTests(unittest.TestCase):
    def test_success_preserves_previous_session(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            current, candidate, previous = [root / name for name in ['state', 'candidate', 'previous']]
            current.write_text('old')
            candidate.write_text('new')
            renew.install_session(candidate, current, previous, lambda: None)
            self.assertEqual(current.read_text(), 'new')
            self.assertEqual(previous.read_text(), 'old')
            self.assertEqual(current.stat().st_mode & 0o777, 0o600)

    def test_failed_restart_restores_previous_session(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            current, candidate, previous = [root / name for name in ['state', 'candidate', 'previous']]
            current.write_text('old')
            candidate.write_text('new')
            calls = []

            def restart():
                calls.append(current.read_text())
                if len(calls) == 1:
                    raise RuntimeError('start failed')

            with self.assertRaises(RuntimeError):
                renew.install_session(candidate, current, previous, restart)
            self.assertEqual(calls, ['new', 'old'])
            self.assertEqual(current.read_text(), 'old')

    def test_expired_or_wrong_domain_session_rejected(self):
        with TemporaryDirectory() as directory:
            candidate = Path(directory) / 'candidate'
            for domain, expires in [('twitch.tv', time.time() - 1), ('evil.twitch.tv.example', time.time() + 3600)]:
                candidate.write_text(json.dumps({'cookies': [{'name': 'auth-token', 'value': 'fixture', 'domain': domain, 'expires': expires}]}))
                with self.assertRaises(ValueError):
                    renew.validate_candidate(candidate)

    def test_failed_browser_verification_keeps_session_and_resumes_service(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            auth = root / '.auth'
            auth.mkdir()
            current = auth / 'state.json'
            current.write_text('old')
            candidate = auth / ('renewal-' + 'a' * 32 + '.json')
            candidate.write_text(json.dumps({'cookies': [{'name': 'auth-token', 'value': 'fixture', 'domain': '.twitch.tv', 'expires': time.time() + 3600}]}))
            active = True
            calls = []

            def command(args, **_kwargs):
                nonlocal active
                calls.append(args)
                if 'is-active' in args:
                    return SimpleNamespace(returncode=0 if active else 3)
                if 'systemd-run' in args:
                    return SimpleNamespace(returncode=1, stdout='{"verified":false}')
                if 'stop' in args and renew.UNIT in args:
                    active = False
                if 'restart' in args:
                    active = True
                return SimpleNamespace(returncode=0)

            with patch.object(renew, 'DIRECTORY', root), patch.object(renew.sys, 'argv', ['renew', candidate.name]), patch.object(renew.subprocess, 'run', side_effect=command), patch.object(renew.time, 'sleep'), patch.object(renew.signal, 'signal'):
                with self.assertRaises(ValueError):
                    renew.main()
            self.assertEqual(current.read_text(), 'old')
            self.assertTrue(active)
            self.assertFalse(candidate.exists())
            self.assertTrue(any('restart' in call for call in calls))


if __name__ == '__main__':
    unittest.main()
