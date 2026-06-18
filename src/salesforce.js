// Thin Salesforce REST client.
//
// Authenticates with the OAuth 2.0 Client Credentials flow (server-to-server,
// no human login required) and creates records on a configurable custom object.
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
  SF_FIELD_PRODUCTS,
  SF_FIELD_NEEDED_DATE,
  SF_FIELD_LOCATION,
  SF_FIELD_REQUESTED_BY,
} = process.env;

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
 * Create a product-request record on the configured custom object.
 * @param {{products: string, neededDate: string, location: string, requestedBy: string}} fields
 * @returns {Promise<string>} the new record's Salesforce Id
 */
export async function createProductRequest(fields) {
  const { accessToken, instanceUrl } = await getAccessToken();

  const record = {
    [SF_FIELD_PRODUCTS]: fields.products,
    [SF_FIELD_NEEDED_DATE]: fields.neededDate,
    [SF_FIELD_LOCATION]: fields.location,
    [SF_FIELD_REQUESTED_BY]: fields.requestedBy,
  };

  const res = await fetch(
    `${instanceUrl}/services/data/v60.0/sobjects/${SF_OBJECT}`,
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
