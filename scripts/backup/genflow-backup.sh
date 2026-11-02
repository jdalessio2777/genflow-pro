#!/bin/bash
# GenFlow nightly backup. Reads production only. See docs/backups.md.
# Runs under macOS /bin/bash 3.2. Secrets come from the Keychain at run time and
# reach child programs only through environment variables, never as arguments.
set +x
set -u -o pipefail
umask 077

# ---------- fixed settings (no secrets) ----------
PROJECT_REF="ntpbjcvlzophmbowocwt"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
REPO="${GENFLOW_REPO:-$HOME/Downloads/genflow-field-pro (12)}"
APP="$HOME/Library/Application Support/GenFlowBackup"
PGBIN="$HOME/Library/GenFlowBackup-pg17/bin"
NODE="/usr/local/bin/node"
DESKTOP_ROOT="$HOME/Desktop/GenFlow Backups"
DRIVE_MYDRIVE="$HOME/Library/CloudStorage/GoogleDrive-jeremy.dalessio@genshieldservice.com/My Drive"
DRIVE_ROOT="$DRIVE_MYDRIVE/GenFlow Backups"
LOG_DIR="$DESKTOP_ROOT/logs"
KEEP=30
EXPECTED_PG_MAJOR=17

# Login-session and one-time-code tables: schema kept, data left out (owner's decision, 2026-11-01).
SCHEMA_ONLY_TABLES="auth.refresh_tokens auth.sessions auth.one_time_tokens auth.flow_state auth.mfa_challenges auth.mfa_amr_claims auth.webauthn_challenges auth.oauth_authorizations auth.oauth_client_states auth.saml_relay_states"

STAMP="$(date '+%Y-%m-%d %H%M')"
NAME="GenFlow Backup $STAMP"
WORK_ROOT="$APP/work"
WORK="$WORK_ROOT/$NAME"
OUT="$WORK/$NAME"
ZIP="$WORK/$NAME.zip"
LOG="$WORK/run.log"
LOCK="$APP/backup.lock"
PSQL_PID=""
LOCK_HELD=0
FINISHED=0
START_SECONDS=$SECONDS
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"

# ---------- small helpers ----------
log() {
  local line
  line="$(date '+%H:%M:%S')  $*"
  if [ -d "$WORK" ]; then printf '%s\n' "$line" >> "$LOG"; fi
  printf '%s\n' "$line"
}

notify() { /usr/bin/osascript -e "display notification \"$1\" with title \"GenFlow backup\"" >/dev/null 2>&1 || true; }

size_of() { /usr/bin/du -sh "$1" 2>/dev/null | /usr/bin/awk '{print $1}'; }

# Delete the work folder only if it is exactly the one this run created.
remove_work() {
  if [ "$WORK" = "$WORK_ROOT/$NAME" ] && [ -d "$WORK" ] && [ ! -L "$WORK" ]; then
    /bin/rm -rf -- "$WORK"
  fi
}

write_history() {
  local dir="$LOG_DIR"
  if ! /bin/mkdir -p "$dir" 2>/dev/null; then dir="$APP/logs"; /bin/mkdir -p "$dir"; fi
  {
    printf '=== %s  %s\n' "$NAME" "$1"
    if [ -n "${2:-}" ]; then printf 'ERROR: %s\n' "$2"; fi
    if [ -f "$LOG" ]; then /bin/cat "$LOG"; fi
    printf '\n'
  } >> "$dir/backup-history.log"
}

stop_psql() {
  if [ -n "$PSQL_PID" ]; then
    exec 3>&- 2>/dev/null || true
    kill "$PSQL_PID" 2>/dev/null || true
    wait "$PSQL_PID" 2>/dev/null || true
    PSQL_PID=""
  fi
}

fail() {
  local message="$1"
  log "FAILED: $message"
  stop_psql
  write_history "FAILED" "$message"
  notify "GenFlow backup FAILED — see log"
  remove_work
  release_lock
  FINISHED=1
  exit 1
}

on_exit() {
  local code=$?
  if [ "$FINISHED" = "0" ]; then
    log "FAILED: stopped unexpectedly (exit $code)"
    stop_psql
    write_history "FAILED" "stopped unexpectedly (exit $code)"
    notify "GenFlow backup FAILED — see log"
    remove_work
    release_lock
  fi
}

release_lock() {
  if [ "$LOCK_HELD" = "1" ]; then
    /bin/rm -f -- "$LOCK/pid"
    /bin/rmdir -- "$LOCK" 2>/dev/null || true
    LOCK_HELD=0
  fi
}

take_lock() {
  if ! /bin/mkdir "$LOCK" 2>/dev/null; then
    local other=""
    if [ -f "$LOCK/pid" ]; then other="$(/bin/cat "$LOCK/pid")"; fi
    if [ -n "$other" ] && kill -0 "$other" 2>/dev/null; then
      fail "another backup is still running (pid $other)"
    fi
    /bin/rm -f -- "$LOCK/pid"
    /bin/rmdir -- "$LOCK" 2>/dev/null || fail "could not clear a stale lock"
    /bin/mkdir "$LOCK" || fail "could not take the lock"
  fi
  LOCK_HELD=1
  printf '%s' "$$" > "$LOCK/pid"
}

# ---------- retention, with the path guard ----------
# Only these two folders, only regular files named exactly by this script.
guarded_delete() {
  local root="$1" path="$2" base dir
  base="${path##*/}"
  dir="${path%/*}"
  case "$root" in
    "$DESKTOP_ROOT"|"$DRIVE_ROOT") ;;
    *) fail "delete guard: refused root $root" ;;
  esac
  [ "$dir" = "$root" ] || fail "delete guard: refused path outside $root"
  [[ "$base" =~ ^GenFlow\ Backup\ [0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9]{4}\.zip(\.partial)?$ ]] || fail "delete guard: refused name $base"
  [ -f "$path" ] && [ ! -L "$path" ] || fail "delete guard: not a regular file: $base"
  /bin/rm -f -- "$path" || fail "could not delete old backup $base"
  log "Deleted old backup: $root/$base"
}

prune() {
  local root="$1" list count remove leftover
  list="$WORK/prune-list.txt"
  # Unfinished copies left by an earlier failed run
  while IFS= read -r leftover; do
    guarded_delete "$root" "$leftover"
  done < <(/usr/bin/find "$root" -maxdepth 1 -type f -name 'GenFlow Backup *.zip.partial' -print)
  /usr/bin/find "$root" -maxdepth 1 -type f -name 'GenFlow Backup *.zip' -print | /usr/bin/sort > "$list" || fail "could not list $root"
  count="$(/usr/bin/grep -c . "$list" || true)"
  log "$root holds $count backups (keeping $KEEP)"
  if [ "$count" -gt "$KEEP" ]; then
    remove=$((count - KEEP))
    while IFS= read -r old; do
      guarded_delete "$root" "$old"
    done < <(/usr/bin/head -n "$remove" "$list")
  fi
}

copy_verified() {
  local root="$1" dest="$root/$NAME.zip" partial="$root/$NAME.zip.partial" a b
  [ ! -e "$dest" ] || fail "$dest already exists"
  /bin/cp "$ZIP" "$partial" || fail "could not copy to $root"
  a="$(/usr/bin/shasum -a 256 "$ZIP" | /usr/bin/awk '{print $1}')"
  b="$(/usr/bin/shasum -a 256 "$partial" | /usr/bin/awk '{print $1}')"
  [ -n "$a" ] && [ "$a" = "$b" ] || fail "copy checksum mismatch in $root"
  /bin/mv -n "$partial" "$dest" || fail "could not finish copy in $root"
  [ -f "$dest" ] || fail "copy missing after move in $root"
  log "Copied and checksum-verified: $dest"
}

# ---------- psql session that holds one read-only snapshot ----------
psql_send() { printf '%s\n' "$1" >&3 || fail "lost the database session"; }

psql_wait() {
  local mark="__GF_DONE_$1__" tries=0
  psql_send "\\echo $mark"
  while ! /usr/bin/grep -qF "$mark" "$WORK/psql.out" 2>/dev/null; do
    kill -0 "$PSQL_PID" 2>/dev/null || fail "database session ended: $(/usr/bin/head -c 400 "$WORK/psql.err")"
    tries=$((tries + 1))
    [ "$tries" -lt 1200 ] || fail "database session timed out"
    /bin/sleep 0.25
  done
}

# Text psql wrote between two marks
psql_section() {
  /usr/bin/awk -v a="__GF_DONE_$1__" -v b="__GF_DONE_$2__" '$0==a{on=1;next} $0==b{on=0} on' "$WORK/psql.out"
}

# ---------- start ----------
trap on_exit EXIT
/bin/mkdir -p "$APP" "$WORK_ROOT" || { notify "GenFlow backup FAILED — see log"; FINISHED=1; exit 1; }
take_lock
/bin/mkdir -p "$OUT/code" "$OUT/storage" || fail "could not create the work folder"

log "$NAME starting on $(/bin/hostname -s), launched by pid $PPID"

for tool in pg_dump pg_restore psql; do
  [ -x "$PGBIN/$tool" ] || fail "$tool is missing at $PGBIN"
done
[ -x "$NODE" ] || fail "node is missing at $NODE"
[ -d "$REPO/.git" ] || fail "repo not found at $REPO"
[ -d "$DRIVE_MYDRIVE" ] || fail "Google Drive folder not found (is Drive running and signed in?)"
PG_MAJOR="$("$PGBIN/pg_dump" --version | /usr/bin/awk '{print $3}' | /usr/bin/cut -d. -f1)"
[ "$PG_MAJOR" = "$EXPECTED_PG_MAJOR" ] || fail "pg_dump major version is $PG_MAJOR, expected $EXPECTED_PG_MAJOR"

/bin/mkdir -p "$DESKTOP_ROOT" "$LOG_DIR" || fail "cannot write to $DESKTOP_ROOT"
/bin/mkdir -p "$DRIVE_ROOT" || fail "cannot write to $DRIVE_ROOT"
/bin/chmod 700 "$DESKTOP_ROOT" 2>/dev/null || true

# ---------- secrets: Keychain into environment only ----------
DB_URL="$(/usr/bin/security find-generic-password -a genflow -s genflow-backup-db-url -w 2>/dev/null)" || fail "database connection not found in Keychain"
SERVICE_KEY="$(/usr/bin/security find-generic-password -a genflow -s genflow-backup-service-key -w 2>/dev/null)" || fail "service key not found in Keychain"
url_pattern='^postgresql://([^:/@]+):([^@]+)@([^:/@]+):([0-9]+)/([^?]+)'
if [[ "$DB_URL" =~ $url_pattern ]]; then
  export PGUSER="${BASH_REMATCH[1]}" PGPASSWORD="${BASH_REMATCH[2]}" PGHOST="${BASH_REMATCH[3]}" PGPORT="${BASH_REMATCH[4]}" PGDATABASE="${BASH_REMATCH[5]}"
else
  fail "database connection string has an unexpected shape"
fi
unset DB_URL
export PGSSLMODE="require" PGAPPNAME="genflow-backup" PGCONNECT_TIMEOUT="30"
[ "$PGUSER" = "postgres.$PROJECT_REF" ] || fail "connection string is not for project $PROJECT_REF"
export PGOPTIONS="-c default_transaction_read_only=on"
log "Secrets loaded from Keychain. Connecting to $PGHOST:$PGPORT as read-only sessions (SSL required)."

# ---------- one read-only snapshot for counts, file list and dumps ----------
/usr/bin/mkfifo "$WORK/psql.in" || fail "could not create the session pipe"
"$PGBIN/psql" -X -q -A -t -v ON_ERROR_STOP=1 < "$WORK/psql.in" > "$WORK/psql.out" 2> "$WORK/psql.err" &
PSQL_PID=$!
exec 3> "$WORK/psql.in"
psql_send "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;"
psql_wait a
psql_send "SELECT 'RO=' || current_setting('transaction_read_only');"
psql_send "SELECT 'VER=' || current_setting('server_version');"
psql_send "SELECT 'SNAP=' || pg_export_snapshot();"
psql_wait b
HEADER="$(psql_section a b)"
[ "$(printf '%s\n' "$HEADER" | /usr/bin/sed -n 's/^RO=//p')" = "on" ] || fail "database session is not read-only; stopping"
SERVER_VERSION="$(printf '%s\n' "$HEADER" | /usr/bin/sed -n 's/^VER=//p')"
SNAPSHOT="$(printf '%s\n' "$HEADER" | /usr/bin/sed -n 's/^SNAP=//p')"
[ -n "$SNAPSHOT" ] || fail "could not get a database snapshot"
case "$SERVER_VERSION" in "$EXPECTED_PG_MAJOR".*) ;; *) fail "server is Postgres $SERVER_VERSION; tools are $EXPECTED_PG_MAJOR" ;; esac
log "Connected. Postgres $SERVER_VERSION, session read-only, snapshot held."

# Row count of every table
psql_send "SELECT format('SELECT %L || E''\\t'' || count(*) FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%' ORDER BY n.nspname, c.relname \\gexec"
psql_wait c
{
  printf '# GenFlow table counts at backup time. %s. Postgres %s.\n' "$NAME" "$SERVER_VERSION"
  printf '# table<TAB>live rows<TAB>in backup: data | schema-only (login-session data left out on purpose)\n'
  psql_section b c | while IFS=$'\t' read -r table rows; do
    [ -n "$table" ] || continue
    mode="data"
    for skip in $SCHEMA_ONLY_TABLES; do
      if [ "$skip" = "$table" ]; then mode="schema-only"; fi
    done
    printf '%s\t%s\t%s\n' "$table" "$rows" "$mode"
  done
} > "$OUT/table-counts.txt" || fail "could not write table counts"
TABLE_COUNT="$(/usr/bin/grep -vc '^#' "$OUT/table-counts.txt" || true)"
[ "$TABLE_COUNT" -gt 40 ] || fail "only $TABLE_COUNT tables counted; expected more than 40"
for skip in $SCHEMA_ONLY_TABLES; do
  /usr/bin/grep -q "^$skip"$'\t' "$OUT/table-counts.txt" || log "WARNING: schema-only table $skip does not exist"
done
log "Counted rows in $TABLE_COUNT tables."

# Storage file list
psql_send "SELECT coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name, 'size', (metadata->>'size')::bigint) ORDER BY bucket_id, name), '[]') FROM storage.objects;"
psql_wait d
psql_section c d > "$OUT/storage-manifest.json" || fail "could not write the storage file list"

# Dumps, from the same snapshot
EXCLUDES=()
for skip in $SCHEMA_ONLY_TABLES; do EXCLUDES+=("--exclude-table-data=$skip"); done
T0=$SECONDS
"$PGBIN/pg_dump" --format=custom --snapshot="$SNAPSHOT" "${EXCLUDES[@]}" --file="$OUT/database.dump" 2>> "$LOG" || fail "pg_dump failed"
log "database.dump written: $(size_of "$OUT/database.dump") in $((SECONDS - T0))s"
T0=$SECONDS
"$PGBIN/pg_dump" --schema-only --snapshot="$SNAPSHOT" --file="$OUT/database-schema.sql" 2>> "$LOG" || fail "schema dump failed"
log "database-schema.sql written: $(size_of "$OUT/database-schema.sql") in $((SECONDS - T0))s"

psql_send "COMMIT;"
psql_send "\\q"
exec 3>&-
wait "$PSQL_PID" || fail "database session did not end cleanly: $(/usr/bin/head -c 400 "$WORK/psql.err")"
PSQL_PID=""

# Check the dump's contents before trusting it
"$PGBIN/pg_restore" --list "$OUT/database.dump" > "$WORK/dump-toc.txt" || fail "database.dump cannot be read back"
for table in "public customers" "public jobs" "public invoices" "auth users" "auth identities" "storage objects"; do
  /usr/bin/grep -q "TABLE DATA $table " "$WORK/dump-toc.txt" || fail "database.dump has no data for $table"
done
for skip in $SCHEMA_ONLY_TABLES; do
  entry="${skip%%.*} ${skip#*.}"
  if /usr/bin/grep -q "TABLE DATA $entry " "$WORK/dump-toc.txt"; then fail "database.dump contains data it should leave out: $skip"; fi
done
log "database.dump read back OK; login-session data confirmed left out."

# ---------- storage files (download only) ----------
T0=$SECONDS
GF_SUPABASE_URL="$SUPABASE_URL" GF_SERVICE_KEY="$SERVICE_KEY" "$NODE" "$APP/download-storage.mjs" "$OUT/storage-manifest.json" "$OUT/storage" >> "$LOG" 2>&1 || fail "storage download failed"
log "storage/ done: $(size_of "$OUT/storage") in $((SECONDS - T0))s"

# ---------- code ----------
T0=$SECONDS
/usr/bin/git -C "$REPO" bundle create "$OUT/code/genflow-all-branches.bundle" --all >> "$LOG" 2>&1 || fail "git bundle failed"
/usr/bin/git -C "$REPO" bundle verify "$OUT/code/genflow-all-branches.bundle" >> "$LOG" 2>&1 || fail "git bundle did not verify"
/usr/bin/git -C "$REPO" ls-files -co --exclude-standard > "$WORK/tree-all.txt" || fail "could not list the working tree"
# Second net on top of .gitignore: never archive these even if something stopped ignoring them.
FORBIDDEN='(^|/)(node_modules|dist|build|\.next|\.vercel|\.qa-scratch|test-results|playwright-report|coverage|\.git)(/|$)|(^|/)\.env[^/]*$|(^|/)\.bypass-secret$|(^|/)\.claude/settings\.local\.json$|\.(pem|key|p12|pfx)$'
/usr/bin/grep -Ev "$FORBIDDEN" "$WORK/tree-all.txt" > "$WORK/tree-keep.txt" || fail "working tree list is empty"
(
  cd "$REPO" || exit 1
  # A tracked file can be deleted but not yet committed; skip those.
  while IFS= read -r f; do
    if [ -e "$f" ] || [ -L "$f" ]; then printf '%s\n' "$f"; fi
  done < "$WORK/tree-keep.txt" | /usr/bin/zip -q -y -X -@ "$OUT/code/working-tree.zip"
) >> "$LOG" 2>&1 || fail "working tree zip failed"
if /usr/bin/unzip -Z1 "$OUT/code/working-tree.zip" | /usr/bin/grep -E "$FORBIDDEN" > "$WORK/leak.txt"; then
  fail "working tree zip contains a forbidden file: $(/usr/bin/head -n 1 "$WORK/leak.txt")"
fi
log "code/ done: bundle $(size_of "$OUT/code/genflow-all-branches.bundle"), working tree $(size_of "$OUT/code/working-tree.zip") in $((SECONDS - T0))s. Branch: $(/usr/bin/git -C "$REPO" branch --show-current), commit $(/usr/bin/git -C "$REPO" rev-parse --short HEAD)"

/bin/cp "$APP/RESTORE.md" "$OUT/RESTORE.md" || fail "RESTORE.md template is missing"

# ---------- secret check: the two secrets must not appear in anything we can scan ----------
secret_patterns() { printf '%s\n%s\n' "$PGPASSWORD" "$SERVICE_KEY"; }
while IFS= read -r f; do
  if [ -f "$REPO/$f" ] && [ ! -L "$REPO/$f" ] && /usr/bin/grep -qF -f <(secret_patterns) -- "$REPO/$f"; then
    fail "working tree file contains a backup secret: $f"
  fi
done < "$WORK/tree-keep.txt"
for f in "$LOG" "$OUT/table-counts.txt" "$OUT/storage-manifest.json" "$OUT/RESTORE.md"; do
  if /usr/bin/grep -qF -f <(secret_patterns) -- "$f"; then fail "secret found in ${f##*/}; stopping"; fi
done
if /usr/bin/grep -qF -f <(secret_patterns) -- "$OUT/database-schema.sql"; then
  fail "a backup secret appears in database-schema.sql; stopping"
fi
log "Secret check passed."
unset SERVICE_KEY

# ---------- zip, verify, copy ----------
log "Backup folder total before zip: $(size_of "$OUT")"
log "Run time before zip: $((SECONDS - START_SECONDS))s"
/bin/cp "$LOG" "$OUT/backup-log.txt" || fail "could not write backup-log.txt"
/bin/chmod -R u+rwX,go-rwx "$OUT"
( cd "$WORK" && /usr/bin/zip -q -r -X "$NAME.zip" "$NAME" ) >> "$LOG" 2>&1 || fail "zip failed"
/usr/bin/unzip -tq "$ZIP" >> "$LOG" 2>&1 || fail "zip did not pass its integrity test"
/bin/chmod 600 "$ZIP"
log "Zip verified: $(size_of "$ZIP")"

copy_verified "$DESKTOP_ROOT"
copy_verified "$DRIVE_ROOT"

# Old backups are removed only after this one is safely in both places.
prune "$DESKTOP_ROOT"
prune "$DRIVE_ROOT"

log "SUCCESS in $((SECONDS - START_SECONDS))s. $(size_of "$ZIP") zip in both folders."
unset PGPASSWORD
write_history "OK"
notify "Backup finished"
remove_work
release_lock
FINISHED=1
exit 0
