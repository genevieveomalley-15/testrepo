// Slack app: a global shortcut opens a "Product Request" form (modal). On
// submit, the data is written to a Salesforce custom object.
//
// Runs in Socket Mode, so it needs no public URL — handy for getting started.

import 'dotenv/config';
import pkg from '@slack/bolt';
const { App } = pkg;

import { createProductRequest } from './salesforce.js';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// ---------------------------------------------------------------------------
// 1) Global shortcut -> open the modal
//    The callback_id must match the shortcut configured in the app manifest.
// ---------------------------------------------------------------------------
app.shortcut('open_product_request', async ({ shortcut, ack, client, logger }) => {
  await ack();

  // Pre-fill "who's requesting it" with the person who opened the form.
  const requesterName = shortcut.user?.username || shortcut.user?.id || '';

  try {
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: buildModal(requesterName),
    });
  } catch (error) {
    logger.error('Failed to open modal', error);
  }
});

// ---------------------------------------------------------------------------
// 2) Modal submission -> validate + push to Salesforce
// ---------------------------------------------------------------------------
app.view('product_request_submit', async ({ ack, body, view, client, logger }) => {
  const values = view.state.values;

  const products = values.products_block.products.value?.trim();
  const neededDate = values.date_block.needed_date.selected_date; // YYYY-MM-DD
  const location = values.location_block.location.value?.trim();
  const requestedBy = values.requester_block.requested_by.value?.trim();

  // Field-level validation surfaces errors inline in the modal.
  const errors = {};
  if (!products) errors.products_block = 'Please list the products needed.';
  if (!neededDate) errors.date_block = 'Please choose a date.';
  if (!location) errors.location_block = 'Please enter a location.';
  if (!requestedBy) errors.requester_block = 'Please enter the requester.';

  if (Object.keys(errors).length > 0) {
    await ack({ response_action: 'errors', errors });
    return;
  }

  await ack();

  const slackUserId = body.user.id;

  try {
    const recordId = await createProductRequest({
      products,
      neededDate,
      location,
      requestedBy,
    });

    await client.chat.postMessage({
      channel: slackUserId,
      text:
        `:white_check_mark: Your product request was sent to Salesforce.\n` +
        `• *Products:* ${products}\n` +
        `• *Needed by:* ${neededDate}\n` +
        `• *Location:* ${location}\n` +
        `• *Requested by:* ${requestedBy}\n` +
        `• *Salesforce record:* ${recordId}`,
    });
  } catch (error) {
    logger.error('Salesforce submission failed', error);
    await client.chat.postMessage({
      channel: slackUserId,
      text:
        `:x: Sorry, I couldn't save your product request to Salesforce.\n` +
        `Please try again, or contact an admin if it keeps happening.\n` +
        `_Error: ${error.message}_`,
    });
  }
});

// ---------------------------------------------------------------------------
// Modal definition (Block Kit)
// ---------------------------------------------------------------------------
function buildModal(requesterName) {
  return {
    type: 'modal',
    callback_id: 'product_request_submit',
    title: { type: 'plain_text', text: 'Product Request' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'products_block',
        label: { type: 'plain_text', text: 'What products are needed?' },
        element: {
          type: 'plain_text_input',
          action_id: 'products',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'e.g. 20x Widget A, 5x Widget B',
          },
        },
      },
      {
        type: 'input',
        block_id: 'date_block',
        label: { type: 'plain_text', text: 'Needed by (date)' },
        element: {
          type: 'datepicker',
          action_id: 'needed_date',
          placeholder: { type: 'plain_text', text: 'Select a date' },
        },
      },
      {
        type: 'input',
        block_id: 'location_block',
        label: { type: 'plain_text', text: 'Where is it needed?' },
        element: {
          type: 'plain_text_input',
          action_id: 'location',
          placeholder: {
            type: 'plain_text',
            text: 'e.g. Chicago warehouse, Booth 14',
          },
        },
      },
      {
        type: 'input',
        block_id: 'requester_block',
        label: { type: 'plain_text', text: "Who's requesting it?" },
        element: {
          type: 'plain_text_input',
          action_id: 'requested_by',
          initial_value: requesterName,
        },
      },
    ],
  };
}

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ Product Request app is running (Socket Mode) on port ${port}`);
})();
