#!/bin/bash
# Proves a backup zip can be restored, using a throwaway LOCAL Postgres only.
# It reads no Keychain item, connects only through a private Unix socket with TCP turned off,
# and deletes its own temp folder at the end.
# Usage: scripts/backup/restore-test.sh "<path to GenFlow Backup ... .zip>" <result file>
set +x
set -u -o pipefail
umask 077

ZIP="${1:?zip path}"
RESULT="${2:?result file}"
PGBIN="$HOME/Library/GenFlowBackup-pg17/bin"
PORT=54329
NODE_BIN="/usr/local/bin/node"
# Nothing may steer these tools at another server.
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE PGOPTIONS PGSSLMODE PGAPPNAME DATABASE_URL

TMP_ROOT="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/gfrt.XXXXXX")" || exit 1
DATA="$TMP_ROOT/pgdata"
FAILS=0
SERVER_UP=0

say() { printf '%s\n' "$*" | /usr/bin/tee -a "$RESULT"; }
bad() { FAILS=$((FAILS + 1)); say "FAIL  $*"; }

cleanup() {
  if [ "$SERVER_UP" = "1" ]; then "$PGBIN/pg_ctl" -D "$DATA" -m immediate -w stop >/dev/null 2>&1; fi
  case "$TMP_ROOT" in
    "${TMPDIR:-/tmp}/gfrt."*) /bin/rm -rf -- "$TMP_ROOT" ;;
  esac
  if [ -e "$TMP_ROOT" ]; then echo "temp folder NOT removed"; else echo "Throwaway database and temp folders deleted."; fi
}
trap cleanup EXIT

: > "$RESULT"
say "Restore test of: $ZIP"
say "Started: $(date)"
/usr/bin/unzip -q "$ZIP" -d "$TMP_ROOT/x" || { bad "could not unzip"; exit 1; }
base="${ZIP##*/}"
B="$TMP_ROOT/x/${base%.zip}"
[ -f "$B/database.dump" ] || { bad "no database.dump in zip"; exit 1; }

say ""
say "--- Contents"
for item in database.dump database-schema.sql table-counts.txt storage-manifest.json storage code/genflow-all-branches.bundle code/working-tree.zip RESTORE.md backup-log.txt; do
  if [ -e "$B/$item" ]; then say "ok    $item ($(/usr/bin/du -sh "$B/$item" | /usr/bin/awk '{print $1}'))"; else bad "$item missing"; fi
done

# ---------- throwaway server ----------
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null || { bad "initdb"; exit 1; }
"$PGBIN/pg_ctl" -D "$DATA" -w -l "$TMP_ROOT/server.log" \
  -o "-p $PORT -c listen_addresses='' -c unix_socket_directories='$TMP_ROOT' -c shared_preload_libraries=pg_stat_statements" start >/dev/null || { bad "server start"; exit 1; }
SERVER_UP=1
export PGHOST="$TMP_ROOT" PGPORT="$PORT" PGUSER="postgres"

# Last check before anything is written: this must be the throwaway server.
actual_socket="$("$PGBIN/psql" -X -At -d postgres -c "SHOW unix_socket_directories")"
actual_listen="$("$PGBIN/psql" -X -At -d postgres -c "SHOW listen_addresses")"
if [ "$actual_socket" != "$TMP_ROOT" ] || [ -n "$actual_listen" ]; then bad "not the throwaway server; stopping"; exit 1; fi

Q() { "$PGBIN/psql" -X -q -At -d gf_restore_test "$@"; }
"$PGBIN/psql" -X -q -d postgres -c "CREATE DATABASE gf_restore_test" || { bad "create database"; exit 1; }

# Supabase's built-in roles, so policies and grants in the dump restore as written.
"$PGBIN/pg_restore" --list "$B/database.dump" > "$TMP_ROOT/toc.txt"
for role in anon authenticated service_role authenticator dashboard_user pgbouncer supabase_admin supabase_auth_admin supabase_storage_admin supabase_realtime_admin supabase_replication_admin supabase_read_only_user supabase_etl_admin supabase_privileged_role pgsodium_keyholder pgsodium_keyiduser pgsodium_keymaker; do
  "$PGBIN/psql" -X -q -d postgres -c "CREATE ROLE $role" 2>/dev/null
done

say ""
say "--- Database restore"
"$PGBIN/pg_restore" --no-owner --dbname=gf_restore_test "$B/database.dump" > "$TMP_ROOT/restore.out" 2> "$TMP_ROOT/restore.err"
say "pg_restore exit code: $?"
say "pg_restore errors: $(/usr/bin/grep -c '^pg_restore: error:' "$TMP_ROOT/restore.err")"
/usr/bin/grep -A1 '^pg_restore: error:' "$TMP_ROOT/restore.err" | /usr/bin/grep -E '^pg_restore: error:' | /usr/bin/cut -c1-170 | /usr/bin/sort | /usr/bin/uniq -c | /usr/bin/sort -rn | /usr/bin/head -n 25 | /usr/bin/tee -a "$RESULT"

say ""
say "--- Row counts: restored vs table-counts.txt"
matched=0; left_out=0
while IFS=$'\t' read -r table rows mode; do
  case "$table" in ''|'#'*) continue ;; esac
  schema="${table%%.*}"; name="${table#*.}"
  got="$(Q -c "SELECT count(*) FROM \"$schema\".\"$name\"" 2>/dev/null)"
  if [ -z "$got" ]; then
    if [ "$rows" = "0" ]; then say "note  $table: table not created locally; it had 0 rows in production"; else bad "$table: missing, expected $rows rows"; fi
  elif [ "$mode" = "schema-only" ]; then
    if [ "$got" = "0" ]; then left_out=$((left_out + 1)); say "ok    $table: empty by design ($rows live rows left out)"; else bad "$table: expected no data, found $got rows"; fi
  elif [ "$got" = "$rows" ]; then
    matched=$((matched + 1))
  else
    bad "$table: restored $got, expected $rows"
  fi
done < "$B/table-counts.txt"
say "Tables with data matching exactly: $matched. Session tables empty by design: $left_out."

say ""
say "--- A few business rows are readable (counts only)"
for sql in \
  "SELECT 'customers with a name: ' || count(*) FROM public.customers WHERE name IS NOT NULL" \
  "SELECT 'jobs linked to a customer that exists: ' || count(*) FROM public.jobs j JOIN public.customers c ON c.id = j.customer_id" \
  "SELECT 'logins with a linked identity: ' || count(DISTINCT u.id) FROM auth.users u JOIN auth.identities i ON i.user_id = u.id"; do
  r="$(Q -c "$sql" 2>&1)" || bad "$sql: $r"
  say "$r"
done

say ""
say "--- RESTORE.md new-project steps (auth and storage tables pre-created locally, as a new project has them)"
"$PGBIN/psql" -X -q -d postgres -c "CREATE DATABASE gf_recipe_test" || bad "create recipe database"
"$PGBIN/psql" -X -q -d gf_recipe_test -c 'CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions; CREATE EXTENSION "uuid-ossp" SCHEMA extensions; CREATE EXTENSION pgcrypto SCHEMA extensions;' || bad "recipe: prepare database"
"$PGBIN/pg_restore" --schema-only --no-owner --schema=auth --schema=storage --dbname=gf_recipe_test "$B/database.dump" >/dev/null 2>&1
"$PGBIN/pg_restore" --data-only --schema=auth --table=users --table=identities --file="$TMP_ROOT/auth-data.sql" "$B/database.dump" || bad "recipe: auth data file"
"$PGBIN/pg_restore" --schema=public --no-owner --file="$TMP_ROOT/public.sql" "$B/database.dump" || bad "recipe: public file"
if "$PGBIN/psql" -X -q --single-transaction -v ON_ERROR_STOP=1 -c 'SET session_replication_role = replica' -f "$TMP_ROOT/auth-data.sql" -f "$TMP_ROOT/public.sql" -d gf_recipe_test > /dev/null 2> "$TMP_ROOT/recipe.err"; then
  recipe_bad=0
  while IFS=$'\t' read -r table rows mode; do
    case "$table" in public.*|auth.users|auth.identities) ;; *) continue ;; esac
    got="$("$PGBIN/psql" -X -q -At -d gf_recipe_test -c "SELECT count(*) FROM ${table%%.*}.\"${table#*.}\"")"
    if [ "$got" != "$rows" ]; then recipe_bad=$((recipe_bad + 1)); bad "recipe: $table restored $got, expected $rows"; fi
  done < "$B/table-counts.txt"
  say "New-project steps ran in one transaction, with $recipe_bad count mismatches."
else
  bad "recipe failed: $(/usr/bin/head -n 3 "$TMP_ROOT/recipe.err" | /usr/bin/cut -c1-200)"
fi

"$PGBIN/pg_restore" --list "$B/database.dump" | /usr/bin/grep ' POLICY storage objects ' > "$TMP_ROOT/policies.list"
"$PGBIN/pg_restore" --use-list="$TMP_ROOT/policies.list" --no-owner --file="$TMP_ROOT/storage-policies.sql" "$B/database.dump" || bad "recipe: policy file"
say "Storage access rules extracted by the RESTORE.md steps: $(/usr/bin/grep -c '^CREATE POLICY' "$TMP_ROOT/storage-policies.sql")"

say ""
say "--- Storage files"
"$NODE_BIN" -e '
const fs=require("fs"),path=require("path");const[b]=process.argv.slice(1);
const m=JSON.parse(fs.readFileSync(path.join(b,"storage-manifest.json"),"utf8"));
let ok=0,bad=[];for(const f of m){const p=path.join(b,"storage",f.bucket,f.name);try{if(fs.statSync(p).size===f.size)ok++;else bad.push(f.name)}catch{bad.push(f.name)}}
console.log(`Files with the right size: ${ok} of ${m.length}`);if(bad.length){console.log("Bad: "+bad.join(", "));process.exit(1)}' "$B" | /usr/bin/tee -a "$RESULT" || bad "storage size check"
/usr/bin/find "$B/storage" -type f ! -name '.emptyFolderPlaceholder' -print > "$TMP_ROOT/files.txt"
say "File types: $(/usr/bin/sed -E 's/.*\.([A-Za-z0-9]+)$/\1/' "$TMP_ROOT/files.txt" | /usr/bin/tr 'A-Z' 'a-z' | /usr/bin/sort | /usr/bin/uniq -c | /usr/bin/awk '{printf "%s %s  ", $1, $2}')"
opened=0
while IFS= read -r f; do
  kind="$(/usr/bin/file -b "$f" | /usr/bin/cut -c1-48)"
  case "$(printf '%s' "${f##*.}" | /usr/bin/tr 'A-Z' 'a-z')" in
    jpg|jpeg|png|heic|webp)
      if /usr/bin/sips -g pixelWidth "$f" >/dev/null 2>&1; then opened=$((opened + 1)); say "open  image: $kind"; else bad "image will not open: ${f##*/}"; fi ;;
    pdf)
      if /usr/bin/head -c 5 "$f" | /usr/bin/grep -q '%PDF-' && /usr/bin/tail -c 1024 "$f" | /usr/bin/grep -qa '%%EOF'; then opened=$((opened + 1)); say "open  pdf: $kind"; else bad "pdf looks damaged: ${f##*/}"; fi ;;
    *) say "seen  other: $kind" ;;
  esac
done < <(/usr/bin/awk 'NR % 5 == 1' "$TMP_ROOT/files.txt")
say "Sampled files that opened: $opened"

say ""
say "--- Code"
if /usr/bin/git bundle verify "$B/code/genflow-all-branches.bundle" > "$TMP_ROOT/bundle.txt" 2>&1; then
  say "ok    git bundle verify ($(/usr/bin/grep -c 'refs/' "$TMP_ROOT/bundle.txt") refs listed)"
else bad "git bundle verify"; fi
if /usr/bin/git clone -q "$B/code/genflow-all-branches.bundle" "$TMP_ROOT/clone" 2> "$TMP_ROOT/clone.err" || [ -d "$TMP_ROOT/clone/.git" ]; then
  /usr/bin/git -C "$TMP_ROOT/clone" fsck --no-progress --connectivity-only >/dev/null 2>&1 && say "ok    git fsck on the clone" || bad "git fsck on the clone"
  say "ok    clone: $(/usr/bin/git -C "$TMP_ROOT/clone" branch -r | /usr/bin/grep -vc HEAD) branches, $(/usr/bin/git -C "$TMP_ROOT/clone" rev-list --all --count) commits"
  say "      main is at $(/usr/bin/git -C "$TMP_ROOT/clone" rev-parse --short origin/main 2>/dev/null)"
else bad "git clone from bundle"; fi
if /usr/bin/unzip -tq "$B/code/working-tree.zip" >/dev/null; then say "ok    working-tree.zip ($(/usr/bin/unzip -Z1 "$B/code/working-tree.zip" | /usr/bin/grep -c .) files)"; else bad "working-tree.zip"; fi
leaks="$(/usr/bin/unzip -Z1 "$B/code/working-tree.zip" | /usr/bin/grep -E '(^|/)(node_modules|dist|\.vercel|\.qa-scratch)(/|$)|(^|/)\.env[^/]*$' | /usr/bin/wc -l | /usr/bin/tr -d ' ')"
if [ "$leaks" = "0" ]; then say "ok    no node_modules, build output, .env, .vercel or .qa-scratch in the zip"; else bad "$leaks excluded files found in zip"; fi

say ""
if [ "$FAILS" = "0" ]; then say "RESULT: PASS"; else say "RESULT: FAIL ($FAILS problems)"; fi
exit "$FAILS"
