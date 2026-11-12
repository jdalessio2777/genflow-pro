# Calendar setup: Google service account for server-side sync (Run 13, B1)

Owner steps, one click at a time. About 15 minutes, on a computer, not a phone.
Sign in everywhere as **jeremy.dalessio@genshieldservice.com**.

None of this is secret except the key file from step 3. **Never email, upload,
commit or paste that file into chat.**

| Thing | Value | Secret? |
|---|---|---|
| Google Cloud project | Project number `1036997577801` (the one GenFlow's Google sign-in uses) | No |
| Service account name | `genflow-calendar` | No |
| Calendar | "GenShield Schedule", ID `c_717f876d6139fd5b54eac3db6236c0d049100049336d4a1833b19f266755ce11@group.calendar.google.com` | No |
| Supabase secret name | `GOOGLE_CALENDAR_SA_KEY` | **The value is** |

---

## Step 1: open the right Google Cloud project
1. Open **https://console.cloud.google.com**.
2. Click the **project picker** at the top left, next to "Google Cloud".
3. In the box that opens, click the **All** tab.
4. Find the project whose **ID number** column says `1036997577801`, then click its name.
5. Check: the picker now shows that project's name.

## Step 2: make sure the Calendar API is on
1. Click the **☰ menu** at the top left.
2. Click **APIs & Services**, then **Library**.
3. In the search box, type `Google Calendar API` and press Enter.
4. Click **Google Calendar API** in the results.
5. If the button says **Enable**, click it. If it says **Manage**, it's already on: go to step 3.

## Step 3: create the service account
1. Click the **☰ menu**, then **IAM & Admin**, then **Service Accounts**.
2. Click **+ Create service account** at the top.
3. **Service account name:** type `genflow-calendar`. The ID fills in by itself.
4. **Description:** type `GenFlow server calendar sync`.
5. Click **Create and continue**.
6. **Permissions (optional):** leave it empty and click **Continue**. It needs no project roles.
7. **Principals with access (optional):** leave it empty and click **Done**.
8. In the list, find `genflow-calendar@….iam.gserviceaccount.com`. Click the **copy icon** next to it, or write it down. It isn't a secret, and you'll need it in step 5.

## Step 4: create its key
1. In the list, click the **genflow-calendar** email to open it.
2. Click the **Keys** tab.
3. Click **Add key**, then **Create new key**.
4. Choose **JSON**, then click **Create**.
5. A `.json` file downloads to your Downloads folder. **This file is the secret.** Leave it there until step 6.

### If step 4 shows "Service account key creation is disabled"
Your Google org blocks keys. This is the default for orgs created after May 3, 2024.

**What it looks like:** a dialog headed **"Service account key creation is disabled"**. The text says an Organization Policy that blocks service account key creation is enforced on your organization, and lists the policy ID **`iam.disableServiceAccountKeyCreation`**. It may also, or instead, list **`iam.managed.disableServiceAccountKeyCreation`**.

To allow keys for this one project only:
1. Click the **project picker** at the top left. Pick your **organization**, `genshieldservice.com`, which has a building icon.
2. Click the **☰ menu**, then **IAM & Admin**, then **IAM**.
3. Click **Grant access**.
4. **New principals:** type your own email.
5. **Select a role:** search `Organization Policy Administrator`, pick it, then click **Save**.
6. Click the **project picker** again and pick project `1036997577801`.
7. Click the **☰ menu**, then **IAM & Admin**, then **Organization Policies**.
8. In the **Filter** box, type `key creation`.
9. Click **Disable service account key creation**.
10. Click **Manage policy**.
11. Under **Policy source**, choose **Override parent's policy**.
12. Under **Policy enforcement**, choose **Replace**.
13. Click **Add a rule**, then set **Enforcement** to **Off**.
14. Click **Done**, then **Set policy**.
15. **If the filter showed two policies with that name,** one legacy and one marked "managed", do steps 9 to 14 for the other one too. Both block keys.
16. Wait 2 minutes, then redo step 4 from the top.

If **Manage policy** is greyed out, the role from sub-step 5 hasn't applied yet. Wait a few minutes and reload.

**If you'd rather not change this policy,** stop and tell me. There is a no-key fallback: a dedicated `schedule@genshieldservice.com` user signs in once. It needs more steps and maybe a paid seat, and I'll write those up instead.

## Step 5: share "GenShield Schedule" with the service account
1. Open **https://calendar.google.com**.
2. In the left column under **My calendars**, hover over **GenShield Schedule**.
3. Click the **⋮** (three dots) that appears, then **Settings and sharing**.
4. Scroll to **Share with specific people or groups**.
5. Click **+ Add people and groups**.
6. Paste the `genflow-calendar@….iam.gserviceaccount.com` email from step 3.
7. In the **Permissions** drop-down, choose **Make changes to events**. Not "Make changes and manage sharing".
8. Click **Send**.
9. Check: the service account now shows in the list with "Make changes to events".

### If it won't offer "Make changes to events", or says the person is outside your organization
Your Workspace limits sharing with outside accounts, and service accounts count as outside.
1. Open **https://admin.google.com**.
2. Click **Apps**, then **Google Workspace**, then **Calendar**.
3. Click **Sharing settings**.
4. Click **External sharing options for secondary calendars**.
5. Choose **Share all information, and allow outsiders to change calendars**, then **Save**.
6. Wait about 10 minutes, then redo step 5.

This setting only allows non-primary calendars to be shared with outsiders. It doesn't share anything by itself.

## Step 6: put the key in Supabase yourself
1. Open **https://supabase.com/dashboard** and click project **ntpbjcvlzophmbowocwt**.
2. In the left menu, click **Edge Functions**, then **Secrets**.
3. Click **Add new secret**.
4. **Name:** type `GOOGLE_CALENDAR_SA_KEY`.
5. **Value:**
   - In Finder, open Downloads.
   - Right-click the new `.json` file, then **Open With** > **TextEdit**.
   - Press **⌘A**, then **⌘C**.
   - Click in the Value box and press **⌘V**.
6. Click **Save**.
7. Close TextEdit without saving.
8. Delete the file: drag the `.json` file to the **Trash**, then right-click the Trash and choose **Empty Trash**.

## Step 7: tell Claude
Reply **"calendar setup done"** and include:
- the service account email from step 3, which isn't a secret
- whether you had to change the key policy (step 4) or the sharing setting (step 5)

Don't include the key or anything from the `.json` file.

## Later: rotating or revoking
- **Revoke right away:** in Google Cloud, go to Service Accounts > genflow-calendar > Keys and delete the key. Or remove the account from the calendar's sharing list.
- **Rotate yearly:** create a new key (step 4), replace the Supabase secret (step 6), then delete the old key in Google Cloud.
