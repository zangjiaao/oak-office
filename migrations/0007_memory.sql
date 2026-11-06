-- Short notes a person keeps after the chat window and after leaving the room.
CREATE TABLE person_memory (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX person_memory_person ON person_memory (person_id, created_at, id);
