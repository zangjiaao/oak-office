-- Each floor keeps its own building colors. Missing values stay the original oak office.
ALTER TABLE department ADD COLUMN style TEXT NOT NULL DEFAULT 'wood';
ALTER TABLE department ADD COLUMN wall TEXT NOT NULL DEFAULT '#243f36';
ALTER TABLE department ADD COLUMN ground TEXT NOT NULL DEFAULT '#c4a574';
ALTER TABLE department ADD COLUMN trim TEXT NOT NULL DEFAULT '#c6a15b';
ALTER TABLE department ADD COLUMN wood TEXT NOT NULL DEFAULT '#6b4428';
