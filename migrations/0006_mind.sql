-- Each person can use a different model and thinking level.
ALTER TABLE people ADD COLUMN model TEXT NOT NULL DEFAULT 'deepseek-flash';
ALTER TABLE people ADD COLUMN thinking TEXT NOT NULL DEFAULT 'low' CHECK (thinking IN ('off', 'low', 'high', 'max'));
