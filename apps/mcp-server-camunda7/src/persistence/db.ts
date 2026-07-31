import postgres from "postgres"

/**
 * The one place a postgres.js client is constructed. Connections are lazy
 * (opened on first query), so booting with an unreachable database only fails
 * once something actually touches a store — and reconnects after a Fly
 * scale-to-zero wake need no extra handling.
 */
export function createSql(databaseUrl: string): postgres.Sql {
  return postgres(databaseUrl, {
    // A handful of connections is plenty: every store call is a single short
    // statement or one SELECT…FOR UPDATE transaction.
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    // NOTICEs (e.g. from CREATE TABLE IF NOT EXISTS) are noise on the server log.
    onnotice: () => {},
  })
}
