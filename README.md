# Asset Request → Slack → Salesforce

A Slack app that collects asset requests through a form (modal) and creates a
record on the Salesforce **Asset Request** custom object (`Asset_Request__c`).

The form, opened from a **global shortcut** (the ⚡ menu in Slack), collects:

| Form field                | Salesforce field (configurable)            |
| ------------------------- | ------------------------------------------ |
| Demo type                 | `Demo_Type__c` (picklist)                  |
| Demo type 2               | `Demo_Type_2__c` (picklist)                |
| What products are needed  | `Product__c`                               |
| Start date                | `Start_Date__c`                            |
| End date                  | `End_Date__c`                              |
| State (location)          | `SF_FIELD_STATE`, else Mission Set Desc.\* |
| Purpose                   | `Purpose__c`                               |
| Mission set description   | `Mission_Set_Description__c`               |
| Custom work needed        | `Custom_Work_Needed__c`                    |
| _Requester (automatic)_   | `OwnerId` (resolved from the Slack user)   |

\* **State storage:** if you set `SF_FIELD_STATE` to a real field API name (e.g.
`State__c`), the state maps there. Otherwise it's prepended into
`Mission_Set_Description__c` so it isn't lost.

**Requester → OwnerId:** the record owner is set to the Salesforce user matched
to the submitting Slack user **by email**. If no active Salesforce user shares
that email, the record stays owned by the integration user and the submitter is
told so in their confirmation DM.

After submission the requester gets a confirmation DM with the new Salesforce
record Id (or a clear error if something went wrong).

---

## How it works

```
Slack global shortcut → modal form → on submit → Salesforce REST API
                                                  (creates an Asset_Request__c record)
```

The app runs in **Socket Mode**, so it needs no public URL or tunnel — just run
it and it connects to Slack over an outbound WebSocket.

---

## Prerequisites

- Node.js 18+ (uses the built-in `fetch`)
- A Slack workspace where you can install apps
- A Salesforce org with the Asset Request object and a Connected App (see below)

---

## 1. Slack setup

1. Go to <https://api.slack.com/apps> → **Create New App** → **From a manifest**.
2. Paste the contents of [`slack-app-manifest.json`](./slack-app-manifest.json).
   (Grants `commands`, `chat:write`, `users:read`, `users:read.email` — the last
   two are needed to map the submitter to a Salesforce user by email.)
3. Install the app to your workspace.
4. Collect three credentials into your `.env` (copy from `.env.example`):
   - **Bot User OAuth Token** (`xoxb-…`) → `SLACK_BOT_TOKEN`
   - **Signing Secret** → `SLACK_SIGNING_SECRET`
   - **App-Level Token** with the `connections:write` scope (`xapp-…`) →
     `SLACK_APP_TOKEN` *(Basic Information → App-Level Tokens → Generate)*

---

## 2. Salesforce setup

> **Note on "Gmail accounts":** Google/Gmail login lets *people* sign into
> Salesforce in a browser. A background app like this one can't log in with
> Gmail — it authenticates as a dedicated Salesforce *integration user* via a
> **Connected App**. This is the secure, standard pattern. Ask your Salesforce
> admin to do the following (one-time):

1. **Custom object** — confirm the field API names match (override in `.env` if
   yours differ). The object is `Asset_Request__c` with fields `Demo_Type__c`,
   `Demo_Type_2__c`, `Purpose__c`, `Product__c`, `Mission_Set_Description__c`,
   `Custom_Work_Needed__c`, `Start_Date__c`, `End_Date__c`. Optionally add a
   `State__c` field and set `SF_FIELD_STATE=State__c` to store the state cleanly.
2. **Connected App** — Setup → App Manager → **New Connected App**:
   - Enable **OAuth Settings**.
   - Enable the **Client Credentials Flow** and select a run-as integration
     user that can create Asset Request records and query Users.
   - Scopes: at least `Manage user data via APIs (api)`.
   - After saving, copy the **Consumer Key** → `SF_CLIENT_ID` and
     **Consumer Secret** → `SF_CLIENT_SECRET`.
3. Set `SF_LOGIN_URL` (`https://login.salesforce.com` for production,
   `https://test.salesforce.com` for a sandbox, or your My Domain URL).

> **Picklist values** live in [`config/picklists.js`](./config/picklists.js) and
> must match Salesforce exactly. They're pre-filled with the current Demo Type /
> Demo Type 2 values — update them there if the picklists change.

---

## 3. Run it

```bash
cp .env.example .env   # then fill in the values
npm install
npm start
```

You should see `⚡️ Asset Request app is running`. In Slack, click the ⚡
shortcut menu → **New asset request**, fill out the form, and submit. A
confirmation DM with the Salesforce record Id should arrive.

---

## Configuration reference

All configuration is via environment variables — see
[`.env.example`](./.env.example) for the full annotated list.

## Project layout

```
src/app.js                Bolt app: shortcut → modal → submit handler
src/salesforce.js         Salesforce auth + user lookup + record creation
config/picklists.js       Demo Type / Demo Type 2 / US state dropdown values
slack-app-manifest.json   One-paste Slack app definition
.env.example              Annotated configuration template
```
