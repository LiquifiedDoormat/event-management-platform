-- Runs once when the local Docker database volume is first created.
-- Creates a separate database for automated integration tests.
CREATE DATABASE event_test OWNER event;
