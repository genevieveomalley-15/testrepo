# Product Request → Slack → Salesforce

A Slack app that collects product requests through a form (modal) and creates a
record on a Salesforce custom object.

The form, opened from a **global shortcut** (the ⚡ menu in Slack), collects:

| Form field                | Salesforce field (configurable) |
| ------------------------- | ------------------------------- |
| What products are needed  | `SF_FIELD_PRODUCTS`             |
| Needed-by date            | `SF_FIELD_NEEDED_DATE`          |
| Where it's needed         | `SF_FIELD_LOCATION`             |
| Who's requesting it       | `SF_FIELD_REQUESTED_BY`         |

After submission the requester gets a confirmation DM with the new Salesforce
record Id (or a clear error if something went wrong).

---

## How it works

```
Slack global shortcut → modal form → on submit → Salesforce REST API
                                                  (creates a custom-object record)
```

The app runs in **Socket Mode**, so it needs no public URL or tunnel — just run
it and it connects to Slack over an outbound WebSocket.

---

## Prerequisites

- Node.js 18+ (uses the built-in `fetch`)
- A Slack workspace where you can install apps
- A Salesforce org with a custom object and a Connected App (see below)

---

## 1. Slack setup

1. Go to <https://api.slack.com/apps> → **Create New App** → **From a manifest**.
2. Paste the contents of [`slack-app-manifest.json`](./slack-app-manifest.json).
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

1. **Custom object** — confirm the object and field API names. Defaults assumed
   by this app (override in `.env` if yours differ):
   - Object: `Asset_Request__c` (the "Asset Request" custom object)
   - Fields: `Products__c` (long text), `Needed_Date__c` (date),
     `Location__c` (text), `Requested_By__c` (text) — **confirm these field
     API names against your object** and override in `.env` if they differ.
2. **Connected App** — Setup → App Manager → **New Connected App**:
   - Enable **OAuth Settings**.
   - Enable the **Client Credentials Flow** and select a run-as integration
     user that has create access to the custom object.
   - Scopes: at least `Manage user data via APIs (api)`.
   - After saving, copy the **Consumer Key** → `SF_CLIENT_ID` and
     **Consumer Secret** → `SF_CLIENT_SECRET`.
3. Set `SF_LOGIN_URL` (`https://login.salesforce.com` for production,
   `https://test.salesforce.com` for a sandbox, or your My Domain URL).

---

## 3. Run it

```bash
cp .env.example .env   # then fill in the values
npm install
npm start
```

You should see `⚡️ Product Request app is running`. In Slack, click the ⚡
shortcut menu → **New product request**, fill out the form, and submit. A
confirmation DM with the Salesforce record Id should arrive.

---

## Configuration reference

All configuration is via environment variables — see
[`.env.example`](./.env.example) for the full annotated list.

## Project layout

```
src/app.js                Bolt app: shortcut → modal → submit handler
src/salesforce.js         Salesforce auth (client credentials) + record creation
slack-app-manifest.json   One-paste Slack app definition
.env.example              Annotated configuration template
```
