# GenFlow backups

Every night at 3:00 AM this Mac makes one zip of GenFlow. Production is only read.

## What's backed up
- **Database:** all schemas, including `auth` and storage metadata. Login-session and one-time-code tables keep their structure but not their data, so everyone signs in again after a restore.
- **Files:** every file in every storage bucket.
- **Code:** a git bundle with all branches and history, plus a zip of the working tree without `node_modules`, build output, `.env*`, `.vercel`, `.qa-scratch` or other secrets.
- **Also:** table counts, a readable schema, `RESTORE.md` and a log.

**Not backed up:** Vercel environment variables, and Stripe, Resend, Google and Supabase dashboard settings.

The zips aren't encrypted and contain customer data and password hashes (owner's decision, 2026-11-01). Don't share the folders.

## Where
- `~/Desktop/GenFlow Backups`
- `~/Library/CloudStorage/GoogleDrive-jeremy.dalessio@genshieldservice.com/My Drive/GenFlow Backups`

Each folder keeps the 30 newest zips. Old ones are deleted only after a new backup has reached both folders. A guard limits deleting to those two folders and to the exact file name `GenFlow Backup YYYY-MM-DD HHMM.zip` (plus `.partial` leftovers from a failed copy).

History and errors: `~/Desktop/GenFlow Backups/logs/backup-history.log`. A failed run also shows a macOS notification.

## Schedule
launchd job `com.genshield.genflow-backup`. If the Mac is asleep at 3:00 AM, it runs at the next wake. If the Mac is shut down at 3:00 AM, or you aren't logged in, that night's backup is skipped.

## How it's put together
| Where | What |
|---|---|
| `scripts/backup/` in this repo | The source. After changing it, run `scripts/backup/install.sh`. |
| `~/Library/Application Support/GenFlowBackup/` | The copies the job actually runs, and `genflow-backup-runner` |
| `~/Library/GenFlowBackup-pg17/` | Postgres 17.11 tools, built from official source because Homebrew has no package for this Mac |
| macOS Keychain | `genflow-backup-db-url` and `genflow-backup-service-key`, account `genflow` |

- **Don't rebuild `genflow-backup-runner`.** Full Disk Access is tied to that exact program, so a new build means granting the permission again.
- **If the repo moves:** the job looks for it at `~/Downloads/genflow-field-pro (12)`. Moving or renaming the folder makes backups fail with a notification, so update `REPO` in `genflow-backup.sh` and reinstall.
- **If Supabase moves to a new Postgres major version:** the script stops with a clear error. Build matching tools and update `EXPECTED_PG_MAJOR`.

## Run it by hand
```
launchctl kickstart gui/$(id -u)/com.genshield.genflow-backup
```

## Restore
Each backup has its own `RESTORE.md`. To prove a backup works, using only a throwaway local database:
```
scripts/backup/restore-test.sh "$HOME/Desktop/GenFlow Backups/<backup name>.zip" /tmp/restore-result.txt
```

## Change the secrets
If the database password or service key changes, backups fail until the Keychain is updated. Run these in Terminal, one line at a time. Use a letters-and-numbers password, and don't use the plain `security add-generic-password` prompt: it silently cuts values to 128 characters.

Database:
```
read -rs "T?Paste the connection string, then press Return: "; echo; read -rs "P?Type or paste the database password, then press Return: "; echo; U="${T/\[YOUR-PASSWORD\]/$P}"; printf 'add-generic-password -a genflow -s genflow-backup-db-url -U -w "%s"\n' "$U" | security -i; unset T P U
```
Service key:
```
read -rs "V?Paste the service role key, then press Return: "; echo; printf 'add-generic-password -a genflow -s genflow-backup-service-key -U -w "%s"\n' "$V" | security -i; unset V
```

## Turn it off
```
launchctl bootout gui/$(id -u)/com.genshield.genflow-backup
rm ~/Library/LaunchAgents/com.genshield.genflow-backup.plist
```
Existing backups stay where they are. Then, to remove the rest:
1. Turn off `genflow-backup-runner` in **System Settings → Privacy & Security → Full Disk Access**.
2. Delete the two Keychain items:
   ```
   security delete-generic-password -a genflow -s genflow-backup-db-url
   security delete-generic-password -a genflow -s genflow-backup-service-key
   ```
