-- Runs once on first container start (docker-entrypoint-initdb.d).
-- Separate database for the API integration tests (TEST_DATABASE_URL).
CREATE DATABASE platform_test OWNER platform;
