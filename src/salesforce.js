// Thin Salesforce REST client.
//
// Authenticates with the OAuth 2.0 Client Credentials flow (server-to-server,
// no human login required) and creates Asset Request records.
//
// Why Client Credentials: this app runs unattended, so it authenticates *as an
// integration user*, not as the Slack user who filled out the form. Your
// Salesforce admin enables this flow on a Connected App and picks the run-as
// user. (Gmail/Google login is for humans signing into Salesforce in a browser
// — it cannot be used by a background service like this one.)

const {
  SF_LOGIN_URL,
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
  SF_OBJECT,
  SF_FIELD_DEMO_TYPE,
  SF_FIELD_DEMO_TYPE_2,
  SF_FIELD_PURPOSE,
  SF_FIELD_PRODUCT,
  SF_FIELD_MISSION,
  SF_FIELD_CUSTOM_WORK,
  SF_FIELD_START_DATE,
  SF_FIELD_END_DATE,
  // Optional: a dedicated field for the state. If unset, the state is
  // prepended into the Mission Set Description field instead.
  SF_FIELD_STATE,
} = process.env;

const API_VERSION = 'v60.0';

// Cache the access token until it (nearly) expires so we don't re-auth on
// every submission.
let cachedToken = null; // { accessToken, instanceUrl, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
  });

  const res = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Salesforce auth failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    instanceUrl: data.instance_url,
    // Tokens from this flow don't return expires_in; assume a conservative
    // 2-hour lifetime and refresh proactively.
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  };
  return cachedToken;
}

/**
 * Look up an active Salesforce User by email so we can set the record owner.
 * @param {string} email
 * @returns {Promise<string|null>} the User Id, or null if no active match
 */
export async function findUserIdByEmail(email) {
  if (!email) return null;
  const { accessToken, instanceUrl } = await getAccessToken();

  // Escape single quotes to keep the SOQL literal safe.
  const safeEmail = email.replace(/'/g, "\\'");
  const soql = `SELECT Id FROM User WHERE Email = '${safeEmail}' AND IsActive = true LIMIT 1`;
  const url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Salesforce user lookup failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.records?.[0]?.Id ?? null;
}

/**
 * Create an Asset Request record.
 * @param {object} fields
 * @param {string} [fields.demoType]
 * @param {string} [fields.demoType2]
 * @param {string} [fields.purpose]
 * @param {string} [fields.product]
 * @param {string} [fields.mission]
 * @param {string} [fields.customWork]
 * @param {string} [fields.startDate]  YYYY-MM-DD
 * @param {string} [fields.endDate]    YYYY-MM-DD
 * @param {string} [fields.state]      two-letter state code
 * @param {string} [fields.ownerId]    Salesforce User Id for the record owner
 * @returns {Promise<string>} the new record's Salesforce Id
 */
export async function createAssetRequest(fields) {
  const { accessToken, instanceUrl } = await getAccessToken();

  const record = {};
  const set = (apiName, value) => {
    if (apiName && value !== undefined && value !== null && value !== '') {
      record[apiName] = value;
    }
  };

  set(SF_FIELD_DEMO_TYPE, fields.demoType);
  set(SF_FIELD_DEMO_TYPE_2, fields.demoType2);
  set(SF_FIELD_PURPOSE, fields.purpose);
  set(SF_FIELD_PRODUCT, fields.product);
  set(SF_FIELD_CUSTOM_WORK, fields.customWork);
  set(SF_FIELD_START_DATE, fields.startDate);
  set(SF_FIELD_END_DATE, fields.endDate);

  // State: use a dedicated field if one is configured; otherwise fold it into
  // the Mission Set Description so the information isn't lost.
  let mission = fields.mission ?? '';
  if (fields.state) {
    if (SF_FIELD_STATE) {
      set(SF_FIELD_STATE, fields.state);
    } else {
      mission = mission
        ? `State: ${fields.state}\n${mission}`
        : `State: ${fields.state}`;
    }
  }
  set(SF_FIELD_MISSION, mission);

  // Record owner = the Slack user who submitted (resolved to a SF User Id).
  // If unresolved, omit it so the record falls back to the integration user.
  if (fields.ownerId) record.OwnerId = fields.ownerId;

  const res = await fetch(
    `${instanceUrl}/services/data/${API_VERSION}/sobjects/${SF_OBJECT}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Salesforce create failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.id;
}
