#!/usr/bin/env bash
# LOCAL DEVELOPMENT ONLY: starts Postgres 16, the Supabase Auth server (GoTrue)
# and a tiny gateway that serves it under /auth/v1 like a hosted Supabase project.
# Usage: scripts/local-services.sh start|stop|reset
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA_DIR:-$ROOT/.local/pgdata}"
PGPORT="${PGPORT:-54322}"
GOTRUE_BIN="${GOTRUE_BIN:-$ROOT/.local/tools/gotrue/auth}"
GOTRUE_MIGRATIONS="${GOTRUE_MIGRATIONS:-$ROOT/.local/tools/gotrue/src/migrations}"
RUN_DIR="$ROOT/.local"
mkdir -p "$RUN_DIR"

as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
psql_admin() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

start_pg() {
  if [ ! -d "$PGDATA" ] || [ ! -f "$PGDATA/PG_VERSION" ]; then
    mkdir -p "$PGDATA"; [ "$(id -u)" = 0 ] && chown postgres:postgres "$PGDATA"
    as_pg "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
  fi
  if ! as_pg "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
    as_pg "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k /tmp' -l $PGDATA/log.txt start" >/dev/null
    sleep 1
  fi
  psql_admin -d postgres -tc "select 1 from pg_database where datname='reqover'" | grep -q 1 \
    || psql_admin -d postgres -c "create database reqover"
  psql_admin -d reqover -f "$ROOT/db/local/bootstrap.sql"
}

start_gotrue() {
  if [ -f "$RUN_DIR/gotrue.pid" ] && kill -0 "$(cat "$RUN_DIR/gotrue.pid")" 2>/dev/null; then return; fi
  set -a; source "$ROOT/.env.local"; set +a
  (cd "$(dirname "$GOTRUE_MIGRATIONS")" && \
    GOTRUE_DB_DRIVER=postgres \
    DATABASE_URL="postgres://supabase_auth_admin:local-auth-admin@127.0.0.1:$PGPORT/reqover" \
    GOTRUE_DB_MIGRATIONS_PATH="$GOTRUE_MIGRATIONS" \
    GOTRUE_JWT_SECRET="$LOCAL_JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
    GOTRUE_JWT_ADMIN_ROLES=service_role \
    API_EXTERNAL_URL="http://127.0.0.1:54321/auth/v1" GOTRUE_API_HOST=127.0.0.1 PORT=9999 \
    GOTRUE_SITE_URL="http://localhost:3000" GOTRUE_URI_ALLOW_LIST="http://localhost:3000" \
    GOTRUE_DISABLE_SIGNUP=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
    GOTRUE_EXTERNAL_PHONE_ENABLED=false GOTRUE_RATE_LIMIT_HEADER=X-Forwarded-For \
    GOTRUE_LOG_LEVEL=warn GOTRUE_OPERATOR_TOKEN=unused \
    nohup "$GOTRUE_BIN" > "$RUN_DIR/gotrue.log" 2>&1 & echo $! > "$RUN_DIR/gotrue.pid")
  for _ in $(seq 1 40); do curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 0.25; done
}

start_gateway() {
  if [ -f "$RUN_DIR/gateway.pid" ] && kill -0 "$(cat "$RUN_DIR/gateway.pid")" 2>/dev/null; then return; fi
  nohup node "$ROOT/scripts/local-gateway.mjs" > "$RUN_DIR/gateway.log" 2>&1 & echo $! > "$RUN_DIR/gateway.pid"
  sleep 0.5
}

stop_all() {
  for s in gateway gotrue; do
    [ -f "$RUN_DIR/$s.pid" ] && kill "$(cat "$RUN_DIR/$s.pid")" 2>/dev/null || true
    rm -f "$RUN_DIR/$s.pid"
  done
  as_pg "$PGBIN/pg_ctl -D $PGDATA stop" >/dev/null 2>&1 || true
}

case "${1:-start}" in
  start) start_pg; start_gotrue; start_gateway; echo "Postgres :$PGPORT, Auth :9999, Gateway :54321 laufen." ;;
  stop) stop_all ;;
  reset)
    start_pg
    psql_admin -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='reqover' and pid <> pg_backend_pid()" >/dev/null
    [ -f "$RUN_DIR/gotrue.pid" ] && kill "$(cat "$RUN_DIR/gotrue.pid")" 2>/dev/null || true; rm -f "$RUN_DIR/gotrue.pid"
    psql_admin -d postgres -c "drop database if exists reqover" -c "create database reqover"
    start_pg; start_gotrue; start_gateway ;;
  test-db)
    # Fresh database for automated tests: Supabase roles, auth schema, app migrations.
    start_pg
    psql_admin -d postgres -c "drop database if exists reqover_test with (force)" -c "create database reqover_test"
    sed 's/on database reqover /on database reqover_test /' "$ROOT/db/local/bootstrap.sql" | psql_admin -d reqover_test -f -
    (cd "$(dirname "$GOTRUE_MIGRATIONS")" && GOTRUE_DB_DRIVER=postgres \
      DATABASE_URL="postgres://supabase_auth_admin:local-auth-admin@127.0.0.1:$PGPORT/reqover_test" \
      GOTRUE_DB_MIGRATIONS_PATH="$GOTRUE_MIGRATIONS" GOTRUE_JWT_SECRET=test-secret-not-used API_EXTERNAL_URL=http://localhost \
      GOTRUE_SITE_URL=http://localhost "$GOTRUE_BIN" migrate >/dev/null 2>&1)
    MIGRATION_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/reqover_test" node "$ROOT/scripts/migrate.mjs" ;;
  *) echo "usage: $0 start|stop|reset|test-db"; exit 1 ;;
esac
