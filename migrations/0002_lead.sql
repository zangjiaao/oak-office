-- One department has a single lead. is_lead is 1 or 0.
ALTER TABLE people ADD COLUMN is_lead INTEGER NOT NULL DEFAULT 0 CHECK (is_lead IN (0, 1));
CREATE UNIQUE INDEX people_one_lead ON people (is_lead) WHERE is_lead = 1;
