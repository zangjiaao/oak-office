-- Employee desks are 0 through 7 and stay put. The lead's seat is null.
ALTER TABLE people ADD COLUMN seat INTEGER CHECK (seat IS NULL OR (seat >= 0 AND seat <= 7));

UPDATE people
SET seat = (
  SELECT COUNT(*)
  FROM people AS earlier
  WHERE earlier.is_lead = 0
    AND (
      earlier.created_at < people.created_at
      OR (earlier.created_at = people.created_at AND earlier.id <= people.id)
    )
) - 1
WHERE is_lead = 0;

CREATE UNIQUE INDEX people_seat ON people (seat) WHERE seat IS NOT NULL;
