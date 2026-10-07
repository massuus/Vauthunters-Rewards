#!/usr/bin/env bash
# Starts a 48-hour read-only trial, at most one attempt per streamer.
set -eu
if systemctl is-active --quiet vh-companion-automation.service; then
  echo 'Ongoing automation is active; stop it before running a separate trial.' >&2
  exit 1
fi
task_dir=/home/ubuntu/companion-collector-test
test "$(realpath "$task_dir")" = /home/ubuntu/companion-collector-test
if systemctl is-active --quiet vh-companion-trial.service; then
  echo 'A trial is already active; no overlapping trial was started.' >&2
  exit 1
fi
trial_id=$(date -u +%Y%m%dT%H%M%SZ)
test -s "$task_dir/.auth/state.json"
exec sudo -n systemd-run --unit=vh-companion-trial --uid=ubuntu --gid=ubuntu \
  -p "WorkingDirectory=$task_dir" -p UMask=0077 \
  -p MemoryMax=1G -p CPUQuota=50% -p TasksMax=128 -p Nice=10 \
  -p RuntimeMaxSec=172800 -p Restart=no -p KillMode=control-group -p TimeoutStopSec=10 \
  -p ProtectSystem=strict -p "ReadWritePaths=$task_dir" \
  -p ReadOnlyPaths=/home/ubuntu/vault-pinger -p PrivateTmp=yes -p NoNewPrivileges=yes \
  --setenv="PATH=/home/ubuntu/.nvm/versions/node/v24.17.0/bin:/usr/bin:/bin" \
  --setenv="PLAYWRIGHT_BROWSERS_PATH=$task_dir/browsers" \
  --setenv="LD_LIBRARY_PATH=$task_dir/libs/usr/lib/aarch64-linux-gnu" \
  --setenv="FONTCONFIG_FILE=$task_dir/fonts.conf" \
  --setenv="COLLECTOR_TRIAL_ID=$trial_id" \
  /home/ubuntu/.nvm/versions/node/v24.17.0/bin/node "$task_dir/watch.mjs"
