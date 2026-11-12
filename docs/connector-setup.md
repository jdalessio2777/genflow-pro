# GenFlow connector for Claude: setup and off switches (Run 13)

Replaces `.qa-scratch/run12/connector-setup.md`. Nothing here is done yet.

**Don't start until all three are true:**
1. `R13-migration.sql` has been run.
2. The Run 13 app is shipped.
3. Supabase's Auth fix (#2898) is live on our project, and the live gate test passes.

Without that fix, a stolen connector token could change a staff member's password. Details and the test: `.qa-scratch/run13/gate.md`.

## What the connector can do: 12 tools
Every tool runs as one audited database function. A connector token can't reach anything else: no tables, no storage, no `/api` routes, no emails, no payments.

| Tool | Kind | What it does |
|---|---|---|
| `search_customers` | read | Find by name, phone, email or address |
| `get_customer` | read | Contact, generator and the 10 latest jobs |
| `create_customer` | write | Refuses likely duplicates unless confirmed |
| `update_customer_contact` | write | Contact and generator fields only; changing a saved generator value needs a confirm |
| `list_schedule` | read | Jobs in a date range, optionally for one tech |
| `check_availability` | read | Who's free; counts the window plus time on site |
| `create_job` | write | One or more techs; arrival window or exact time. **Never emails.** **Not added to Google Calendar** until someone saves the job in GenFlow (Edit, then Save), because Part B was skipped |
| `finance_summary` | read | Revenue, expenses, net, card processing fees and unpaid invoices. Same calculation as Finance and Insights |
| `list_expenses` | read | By dates, search text, amount and category |
| `list_expense_categories` | read | The app's categories |
| `add_expense` | write | One expense: receipt, manual or bank statement. Refuses likely duplicates (same amount, within 2 days, similar vendor) unless confirmed |
| `add_expenses_bulk` | write | Up to 200 rows, for example a bank statement. Says which rows were added and which were skipped, and why |

There are no tools for deleting, mileage, payments, card charges or payment links.

**Receipts:** Claude reads the photo and passes the fields. No image is uploaded.

## Part 1: before it can connect

You do steps 1, 3, 4 and 5. I do steps 2 and 6, and only once you say so.

1. **Check the Auth fix has reached us.** I'll do this with you. The test is in `gate.md`, under "How we'll know the fix reached us".
2. **Ship (me):** the app and the `genflow-mcp` function.
3. **Turn on the OAuth server.**
   - In Supabase, go to **Authentication > OAuth Server** and turn it on.
   - **Authorization Path:** `/oauth/consent`
   - **Allow Dynamic OAuth Apps:** OFF
   - **Site URL:** under **Authentication > URL Configuration**, check it's `https://genflow-pro.vercel.app`. Tell me if it isn't, and don't change it without checking with me.
4. **Create the OAuth app.** On **Authentication > OAuth Apps**:
   - **Name:** `Claude`
   - **Redirect URI:** exactly `https://claude.ai/api/mcp/auth_callback`
   - **Type:** public, if it asks
   - Copy the client ID. It isn't a secret. Never paste a client secret into chat.
5. **Switch it on in the database.** Paste this into the SQL editor, with your client ID:
   ```sql
   update public.connector_settings set oauth_client_id = '<client id>', enabled = true where id = 1;
   ```
   Only you are switched on. To add someone else, run `update public.staff set connector_enabled = true where email = '<their email>';`
6. **Live gate test (me, QA user only).** Every row in `gate.md` must pass. If any row fails, turn the OAuth server off again and stop.

## Part 2: add it in Claude
Do this on a computer at claude.ai. It then works on your phone too, because connectors belong to your account.

1. Go to **Customize > Connectors**.
2. Click **Add custom connector**.
3. **Name:** `GenFlow`
4. **MCP server URL:** `https://ntpbjcvlzophmbowocwt.supabase.co/functions/v1/genflow-mcp`
5. **Client ID:**
   - If it's one screen, open **Advanced settings** and enter the client ID. Leave the secret blank.
   - If it's two steps, choose **Sign in now**, then **Use your own OAuth client**. Enter the client ID and leave the secret blank.
6. Click **Add**.

## Part 3: sign in
1. Claude opens a GenFlow page titled "Connect Claude to GenFlow".
2. Tap **Sign in with Google** and use your normal GenShield account.
3. Check it says it goes back to claude.ai, then tap **Allow**.

## Using it
- **Turn it on in a chat:** click **+**, choose **Connectors**, and turn GenFlow on.
- **Ask before each write:** Claude does this by default. Only set **Always allow** on read-only tools. Keep `create_job`, `add_expense` and `add_expenses_bulk` on ask.
- **Bank statements:**
  - Ask Claude to list the business lines first.
  - Check the list, then let it call `add_expenses_bulk`.
  - Rows it skips as likely duplicates come back with the match, for you to decide.
- **Audit log:** every call is recorded in `connector_audit_log`, with who, when, which tool, the inputs and the result.

## Turn it off or revoke access

| To do this | Do this | Effect |
|---|---|---|
| **Off for everyone, right now** | SQL editor: `update public.connector_settings set enabled = false;` | The next call is refused, whatever tokens exist. **Use this one in a hurry.** |
| One person off | `update public.staff set connector_enabled = false where email = '…';` | Refused on their next call |
| End one sign-in | Supabase **Authentication > Users**: open the user and sign them out. Or revoke the grant on the consent page | The guard checks the session on every call, so it's refused right away |
| Off for one chat | **+ > Connectors**, toggle GenFlow off | That chat only |
| Block one tool | **Customize > Connectors**, select GenFlow, set the tool to **Blocked** | That tool, for your account |
| Remove from your Claude | **Customize > Connectors** > **Remove** | Your account stops using it |
| Stop the function too | Supabase **Edge Functions**: delete `genflow-mcp`, or set the secret `GENFLOW_MCP_DISABLED` to `1` | Every call fails |
| Stop new sign-ins | **Authentication > OAuth Apps**: delete `Claude`, then turn the OAuth Server off | No new tokens |
