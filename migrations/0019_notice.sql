-- Opening the horn clears the mark for that person only.
CREATE TABLE notice_seen (
  email TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  CHECK (length(email) BETWEEN 3 AND 254),
  CHECK (length(notice_id) BETWEEN 1 AND 64)
);
