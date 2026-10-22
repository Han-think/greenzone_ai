-- 현재 SQLite의 실제 DDL. FK 미선언. 수정/실행하지 않는 확인용.
CREATE TABLE history (id INTEGER PRIMARY KEY, kind TEXT, record_id TEXT, before_json TEXT, after_json TEXT, reason TEXT, actor TEXT, changed_at TEXT);

CREATE TABLE records (kind TEXT, record_id TEXT, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(kind, record_id));

CREATE TABLE seeds (name TEXT PRIMARY KEY);
