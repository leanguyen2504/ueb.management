#!/usr/bin/env bash
# Chạy migration và kiểm thử RLS trên một Postgres tạm.
# Dùng: DATABASE_URL=postgres://... scripts/test-db.sh
# Không có DATABASE_URL: tự khởi tạo Postgres tạm (cần initdb/pg_ctl trong PATH).
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() { :; }
if [ -z "${DATABASE_URL:-}" ]; then
  PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
  TMP="$(mktemp -d)"
  AS=()
  # initdb không chạy được bằng root: dùng tài khoản postgres nếu có.
  if [ "$(id -u)" = 0 ]; then chown postgres "$TMP"; AS=(runuser -u postgres --); fi
  "${AS[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
  "${AS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p 54329 -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
  cleanup() { "${AS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null || true; rm -rf "$TMP"; }
  DATABASE_URL="postgresql://postgres@/postgres?host=$TMP&port=54329"
fi
trap cleanup EXIT

run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X -o /dev/null -f "$1"; }
run supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "migration: $f"; run "$f"; done
for f in supabase/tests/[1-9]*.sql; do echo "test: $f"; run "$f"; done
echo "Tất cả kiểm thử cơ sở dữ liệu đều đạt."
