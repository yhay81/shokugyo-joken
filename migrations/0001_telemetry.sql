CREATE TABLE IF NOT EXISTS product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_hash TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN ('visited', 'searched', 'no_result', 'group_changed', 'employment_changed', 'year_changed', 'metric_changed', 'occupation_added', 'occupation_removed', 'compared', 'copied')),
  is_qa INTEGER NOT NULL DEFAULT 0 CHECK (is_qa IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_events_created_at ON product_events(created_at);
CREATE INDEX IF NOT EXISTS idx_product_events_session ON product_events(session_hash, created_at);
