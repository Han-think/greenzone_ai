-- 기존 출처·건물·후보·규칙·문서 테이블을 유지하고 품목 검색 테이블만 추가한다.
CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT, reference_date TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS waste_items (
  item_id TEXT PRIMARY KEY,
  official_name TEXT NOT NULL,
  category TEXT NOT NULL,
  official_category TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  managed_by TEXT NOT NULL DEFAULT 'official_seed'
);
CREATE TABLE IF NOT EXISTS item_aliases (
  alias_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES waste_items(item_id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  origin TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  managed_by TEXT NOT NULL DEFAULT 'official_seed',
  UNIQUE(item_id, alias)
);
CREATE INDEX IF NOT EXISTS ix_item_alias_normalized ON item_aliases(normalized_alias);
CREATE TABLE IF NOT EXISTS item_rules (
  rule_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES waste_items(item_id),
  district_code TEXT NOT NULL,
  district_name TEXT NOT NULL,
  source_item_code TEXT NOT NULL,
  specification TEXT NOT NULL,
  fee_krw INTEGER CHECK(fee_krw IS NULL OR fee_krw >= 0),
  fee_status TEXT NOT NULL,
  collection_status TEXT NOT NULL,
  housing_type TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  guide_source_id TEXT NOT NULL REFERENCES sources(source_id),
  checked_at TEXT NOT NULL,
  reference_date TEXT,
  effective_from TEXT,
  effective_until TEXT,
  verification_status TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  snapshot_id TEXT NOT NULL,
  managed_by TEXT NOT NULL DEFAULT 'official_seed',
  UNIQUE(district_code, source_id, source_item_code)
);
CREATE INDEX IF NOT EXISTS ix_item_rules_region ON item_rules(district_code,item_id,active);
