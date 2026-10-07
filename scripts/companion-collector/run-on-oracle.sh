#!/usr/bin/env bash
# One bounded, read-only run on the existing VM. No cron/PM2 changes.
set -eu
if systemctl is-active --quiet vh-companion-automation.service; then
  echo 'Ongoing automation is active; stop it before running a separate probe.' >&2
  exit 1
fi
task_dir=/home/ubuntu/companion-collector-test
export PLAYWRIGHT_BROWSERS_PATH="$task_dir/browsers"
export LD_LIBRARY_PATH="$task_dir/libs/usr/lib/aarch64-linux-gnu"
export FONTCONFIG_FILE="$task_dir/fonts.conf"
export PATH=/home/ubuntu/.nvm/versions/node/v24.17.0/bin:$PATH
cd "$task_dir"
exec systemd-run --user --scope --unit=vh-companion-test \
  -p MemoryMax=1G -p CPUQuota=50% -p TasksMax=128 \
  /usr/bin/time -f 'probe_resources elapsed=%e user_cpu=%U system_cpu=%S max_process_rss_kb=%M' \
  timeout -k 5 150 node collect.mjs \
  --live-check-env-file /home/ubuntu/vault-pinger/.env "$@"
