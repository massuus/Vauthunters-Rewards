"""Install a manually renewed session, with bounded verification and rollback."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import fcntl
import signal

DIRECTORY = Path('/home/ubuntu/companion-collector-test')
UNIT = 'vh-companion-automation.service'


def validate_candidate(candidate):
    if candidate.is_symlink() or not candidate.is_file() or candidate.stat().st_size > 1024 * 1024:
        raise ValueError('Invalid session file')
    state = json.loads(candidate.read_text())
    cookies = state.get('cookies', [])
    if not any(c.get('name') == 'auth-token' and c.get('value')
               and c.get('domain', '').lstrip('.') in ('twitch.tv', 'www.twitch.tv')
               and (c.get('expires') == -1 or c.get('expires', 0) > time.time()) for c in cookies):
        raise ValueError('No usable Twitch login')


def install_session(candidate, current, previous, restart):
    """Swap only after verification; restore the old file if service start fails."""
    had_previous = current.exists()
    if had_previous:
        shutil.copy2(current, previous)
        previous.chmod(0o600)
    os.replace(candidate, current)
    current.chmod(0o600)
    try:
        restart()
    except Exception:
        if had_previous:
            shutil.copy2(previous, current)
            current.chmod(0o600)
        else:
            current.unlink()
        restart()
        raise


def main():
    def interrupted(_signum, _frame):
        raise RuntimeError('Renewal interrupted')

    for signum in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, interrupted)
    if len(sys.argv) != 2 or not re.fullmatch(r'renewal-[a-f0-9]{32}\.json', sys.argv[1]):
        raise ValueError('Invalid renewal filename')
    auth = DIRECTORY / '.auth'
    candidate = auth / sys.argv[1]
    os.umask(0o077)
    with (auth / 'renew.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            validate_candidate(candidate)
        except Exception:
            candidate.unlink(missing_ok=True)
            raise
        candidate.chmod(0o600)
        active = subprocess.run(['systemctl', 'is-active', '--quiet', UNIT]).returncode == 0
        enabled = subprocess.run(['systemctl', 'is-enabled', '--quiet', UNIT], capture_output=True).returncode == 0
        resume = active or enabled

        def restart():
            if resume:
                subprocess.run(['sudo', '-n', 'systemctl', 'restart', UNIT], check=True, capture_output=True, timeout=25)
                time.sleep(3)
                subprocess.run(['systemctl', 'is-active', '--quiet', UNIT], check=True)

        try:
            # Avoid running a verification browser beside an ongoing collection.
            if active:
                subprocess.run(['sudo', '-n', 'systemctl', 'stop', UNIT], check=True, capture_output=True, timeout=25)
            command = ['sudo', '-n', 'systemd-run', '--quiet', '--wait', '--pipe', '--collect',
                       '--unit=vh-companion-renew-check', '--uid=ubuntu', '--gid=ubuntu']
            for prop in ['MemoryMax=1G', 'CPUQuota=50%', 'TasksMax=128', 'Nice=10',
                         'RuntimeMaxSec=70', 'TimeoutStopSec=5', 'KillMode=control-group',
                         'ProtectSystem=strict', f'ReadWritePaths={DIRECTORY}', 'PrivateTmp=yes',
                         'NoNewPrivileges=yes', 'UMask=0077', f'WorkingDirectory={DIRECTORY}']:
                command += ['-p', prop]
            for value in [f'PLAYWRIGHT_BROWSERS_PATH={DIRECTORY}/browsers',
                          f'LD_LIBRARY_PATH={DIRECTORY}/libs/usr/lib/aarch64-linux-gnu',
                          f'FONTCONFIG_FILE={DIRECTORY}/fonts.conf']:
                command += [f'--setenv={value}']
            command += ['/home/ubuntu/.nvm/versions/node/v24.17.0/bin/node',
                        str(DIRECTORY / 'verify-session.mjs'), '--storage-state', str(candidate)]
            result = subprocess.run(command, capture_output=True, text=True, timeout=85)
            if result.returncode or not json.loads(result.stdout).get('verified'):
                raise ValueError('Twitch did not accept the new session')
            install_session(candidate, auth / 'state.json', auth / 'state.previous.json', restart)
            print('Twitch accepted the renewed login on Oracle. Previous session backed up.')
            print('Collector is running.' if resume else 'Collector was disabled and remains stopped.')
            print('Existing daily collection limits were preserved.')
        finally:
            try:
                # Also stop a verification unit whose waiting SSH client was interrupted.
                subprocess.run(['sudo', '-n', 'systemctl', 'stop', 'vh-companion-renew-check.service'], capture_output=True, timeout=15)
                if resume and subprocess.run(['systemctl', 'is-active', '--quiet', UNIT]).returncode != 0:
                    restart()
            finally:
                candidate.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Renewal failed. The previous session was kept or restored. Ask the assistant to check if the collector is running.', file=sys.stderr)
        sys.exit(1)
