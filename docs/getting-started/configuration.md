# Konfiguration

Alle Konfiguration erfolgt über Umgebungsvariablen.

## Engine-Konfiguration

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `ENGINE_TYPE` | `cibseven` | Engine-Typ: `camunda7`, `cibseven`, `operaton` |
| `ENGINE_BASE_URL` | `http://localhost:8080/engine-rest` | REST API Base URL |
| `ENGINE_AUTH_TYPE` | `basic` | Authentifizierung: `basic`, `bearer`, `none` |
| `ENGINE_USERNAME` | — | Benutzername (bei `basic`) |
| `ENGINE_PASSWORD` | — | Passwort (bei `basic`) |
| `ENGINE_TOKEN` | — | Token (bei `bearer`) |

## ClickHouse-Konfiguration

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `CLICKHOUSE_ENABLED` | `false` | ClickHouse-Tools aktivieren |
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse HTTP-Endpunkt |
| `CLICKHOUSE_USER` | `camunda` | ClickHouse Benutzer |
| `CLICKHOUSE_PASSWORD` | `camunda123` | ClickHouse Passwort |
| `CLICKHOUSE_DATABASE` | `camunda_history` | Standard-Datenbank |

## OTEL-Konfiguration

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `OTEL_ENABLED` | `true` | OTEL Instrumentierung aktivieren |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTEL Collector Endpunkt |

## Beispiel: Minimale Konfiguration

```env
ENGINE_TYPE=cibseven
ENGINE_BASE_URL=http://localhost:8080/engine-rest
ENGINE_AUTH_TYPE=basic
ENGINE_USERNAME=demo
ENGINE_PASSWORD=demo
```

## Beispiel: Vollständige Konfiguration

```env
ENGINE_TYPE=cibseven
ENGINE_BASE_URL=http://localhost:8080/engine-rest
ENGINE_AUTH_TYPE=basic
ENGINE_USERNAME=demo
ENGINE_PASSWORD=demo

CLICKHOUSE_ENABLED=true
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=camunda
CLICKHOUSE_PASSWORD=camunda123

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```
