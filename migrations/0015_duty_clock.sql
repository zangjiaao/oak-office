-- A daily duty can name a clock minute in Asia/Shanghai. Null keeps the old interval.
ALTER TABLE duty ADD COLUMN at_minutes INTEGER;
