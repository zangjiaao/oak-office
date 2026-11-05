-- One department's hired people. Brief and dossier stay null when unset.
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  hair TEXT NOT NULL,
  skin TEXT NOT NULL,
  shirt TEXT NOT NULL,
  pants TEXT NOT NULL,
  hair_style TEXT NOT NULL,
  brief TEXT,
  dossier TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (gender IN ('female', 'male', 'unspecified')),
  CHECK (hair_style IN ('short', 'bun', 'crop')),
  CHECK (length(trim(name)) BETWEEN 1 AND 32),
  CHECK (brief IS NULL OR length(trim(brief)) BETWEEN 1 AND 80),
  CHECK (dossier IS NULL OR length(trim(dossier)) BETWEEN 1 AND 4000)
);
