# Asset Request App — Usage Guide

A walkthrough split into **one-time setup** (done once by whoever deploys it) and
**everyday use** (for the people filling out the form).

---

## Part 1 — One-time setup

### Step 1: Get the code

```bash
git clone https://github.com/genevieveomalley-15/testrepo.git
cd testrepo
git checkout claude/gracious-franklin-4i9msx
npm install
```

Requires **Node.js 18+**.

### Step 2: Create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From a manifest**.
2. Pick your workspace, then paste the contents of `slack-app-manifest.json`.
3. Click **Create**, then **Install to Workspace** and approve.
4. Collect three credentials:
   - **OAuth & Permissions** → **Bot User OAuth Token** (`xoxb-…`)
   - **Basic Information** → **Signing Secret**
   - **Basic Information → App-Level Tokens** → **Generate Token** with the
     `connections:write` scope (`xapp-…`)

### Step 3: Set up Salesforce (admin task)

1. **Connected App:** Setup → App Manager → **New Connected App**
   - Enable **OAuth Settings**.
   - Enable the **Client Credentials Flow** and choose a run-as integration user
     that can create Asset Requests and query Users.
   - Add the scope **Manage user data via APIs (api)**.
   - Save, then copy the **Consumer Key** and **Consumer Secret**.
2. *(Optional, recommended)* Add a `State__c` field to the Asset Request object so
   the state stores cleanly instead of folding into the description.

### Step 4: Configure

```bash
cp .env.example .env
```

Fill in `.env`: the three Slack values, `SF_LOGIN_URL`, and the Consumer
Key/Secret. If you created `State__c`, set `SF_FIELD_STATE=State__c`.

### Step 5: Run it

```bash
npm start
```

You should see:

```
⚡️ Asset Request app is running (Socket Mode) on port 3000
```

Leave it running. For production, host it on a server/container so it stays up.

---

## Part 2 — Everyday use

1. In Slack, click the **⚡ shortcuts menu** near the message box (or type `/` and
   look for shortcuts).
2. Choose **New asset request**.
3. Fill out the form (all fields required):
   - **Demo type** & **Demo type 2** — pick from the dropdowns
   - **What products are needed**
   - **Start date** / **End date**
   - **State** — pick from the list
   - **Purpose**, **Mission set description**, **Custom work needed**
4. Click **Submit**.
5. The app DMs you a confirmation with the new Salesforce record Id.

The request lands in Salesforce as an **Asset Request** record, owned by you
(matched via your email).

---

## Troubleshooting

- **DM says "owned by integration user":** your Slack email doesn't match an
  active Salesforce user. Make the emails match.
- **Submission failed:** the DM shows the error — usually a `.env` credential
  issue or a Salesforce field/permission mismatch.
- **Picklist changed in Salesforce:** update the values in `config/picklists.js`
  to match, then restart the app.
