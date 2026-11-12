# How to restore GenFlow from this backup

**This backup holds private customer data and password hashes. It isn't encrypted. Don't share it.**

**Never restore into the live GenFlow project (`ntpbjcvlzophmbowocwt`) without deciding that on purpose.** These steps build a NEW Supabase project, then point the app at it.

## What's in this folder
| Item | What it is |
|---|---|
| `database.dump` | The whole database, for `pg_restore` |
| `database-schema.sql` | The database structure as readable text. No data. |
| `table-counts.txt` | Rows in every table at backup time, to check a restore against |
| `storage/` | Every uploaded file (photos, documents). Folders match the buckets. |
| `storage-manifest.json` | List of the files and their sizes |
| `code/genflow-all-branches.bundle` | The full git repo: all branches and history |
| `code/working-tree.zip` | The code files as they were on the Mac, including uncommitted work |
| `backup-log.txt` | What ran, sizes and timings |

## What's left out on purpose
- **Login sessions and one-time codes:** the data in `auth.refresh_tokens`, `auth.sessions`, `auth.one_time_tokens`, `auth.flow_state`, `auth.mfa_challenges`, `auth.mfa_amr_claims`, `auth.webauthn_challenges`, `auth.oauth_authorizations`, `auth.oauth_client_states` and `auth.saml_relay_states`. These tables are restored empty.
  **After a restore, everyone just signs in again.** Accounts and passwords are kept in `auth.users` and `auth.identities`.
- **All secrets and service settings.** You'll need to set these up again by hand:
  - Vercel environment variables
  - Stripe, Resend, Google and QuickBooks settings
  - Supabase dashboard settings: login providers, redirect URLs, email templates and SMTP

## You'll need
- Postgres 17 tools (`pg_restore` and `psql`). On the original Mac they're in `~/Library/GenFlowBackup-pg17/bin`. On another Mac, run `brew install postgresql@17`, or use the official installer.
- A new Supabase project on Postgres 17. Copy its **Session pooler** connection string from the **Connect** button, and fill in its password.

## Restore the database
Open Terminal in this folder. Put the Postgres 17 tools on your PATH, for example:
```
export PATH="$HOME/Library/GenFlowBackup-pg17/bin:$PATH"
```
Store the NEW project's connection string without showing it, then confirm it isn't production:
```
read -rs "TARGET?Paste the NEW project's connection string, then press Return: "; echo; export TARGET
case "$TARGET" in *ntpbjcvlzophmbowocwt*) echo "STOP: this is PRODUCTION"; unset TARGET;; *) echo "OK: not production";; esac
```
Turn the backup into three SQL files:
```
pg_restore --data-only --schema=auth --table=users --table=identities --file=auth-data.sql database.dump
pg_restore --schema=public --no-owner --file=public.sql database.dump
pg_restore --list database.dump | grep ' POLICY storage objects ' > policies.list
pg_restore --use-list=policies.list --no-owner --file=storage-policies.sql database.dump
```
Load them. This is all-or-nothing, so if it fails, nothing is kept:
```
psql --single-transaction -v ON_ERROR_STOP=1 -c 'SET session_replication_role = replica' -f auth-data.sql -f public.sql -f storage-policies.sql -d "$TARGET"
```
Check the counts for `public.*`, `auth.users` and `auth.identities` against `table-counts.txt`, for example:
```
psql -d "$TARGET" -c "select count(*) from public.customers"
```
`auth.users` and `auth.identities` can fail to load if Supabase has since changed those tables. If so, compare the columns in `database-schema.sql` with the new project's.

## Restore the files
1. In the new project, open **Storage** and create a bucket with the same name and public setting. Today that's `uploads`, set to private (Run 13; it was public before).
2. Upload the contents of `storage/uploads/`, keeping the folders.

Upload the files rather than restoring the `storage.objects` rows. Uploading recreates those rows correctly.

**Saved links:** if the database stores full file links, they name the old project. To find them, search the restored data for `ntpbjcvlzophmbowocwt`. The app will need those links updated if the old project is gone.

## Restore the code
```
git clone code/genflow-all-branches.bundle genflow-restored
cd genflow-restored
git branch -r
```
Then, if GitHub needs rebuilding, point `origin` at a new repo and run `git push --all`. `code/working-tree.zip` also holds any uncommitted files from that night.

## Point the app at the new project
1. In Vercel, update `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy.
2. Set up the login provider and redirect URLs again in the new Supabase project and in Google.
3. Update the Stripe webhook if its address changes.
4. Sign in and check customers, jobs, invoices and a photo.

## Just need one thing back?
Restore into a throwaway database on your Mac and copy what you need. Don't touch production. `scripts/backup/restore-test.sh` in the code shows how to run one safely.
