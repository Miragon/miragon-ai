-- Runs once on first container init (docker-entrypoint-initdb.d). The extra
-- database keeps the opt-in `pnpm test:pg` suites away from the playground's
-- own data — the tests DROP/CREATE their schemas inside it.
CREATE DATABASE miragon_test;
