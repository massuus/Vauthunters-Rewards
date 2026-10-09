CREATE TABLE IF NOT EXISTS companion_collector_health (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reported_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  report_json TEXT NOT NULL
);
