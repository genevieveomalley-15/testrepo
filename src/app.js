// Slack app: a global shortcut opens an "Asset Request" form (modal). On
// submit, the data is written to the Salesforce Asset Request custom object.
//
// Runs in Socket Mode, so it needs no public URL — handy for getting started.

import 'dotenv/config';
import pkg from '@slack/bolt';
const { App } = pkg;

import { createAssetRequest, findUserIdByEmail } from './salesforce.js';
import {
  DEMO_TYPE_OPTIONS,
  DEMO_TYPE_2_OPTIONS,
  US_STATES,
} from '../config/picklists.js';

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
app.shortcut('open_asset_request', async ({ shortcut, ack, client, logger }) => {
  await ack();
  try {
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: buildModal(),
    });
  } catch (error) {
    logger.error('Failed to open modal', error);
  }
});

// ---------------------------------------------------------------------------
// 2) Modal submission -> validate + push to Salesforce
// ---------------------------------------------------------------------------
app.view('asset_request_submit', async ({ ack, body, view, client, logger }) => {
  const v = view.state.values;

  const fields = {
    demoType: v.demo_type_block.demo_type.selected_option?.value,
    demoType2: v.demo_type_2_block.demo_type_2.selected_option?.value,
    purpose: v.purpose_block.purpose.value?.trim(),
    product: v.product_block.product.value?.trim(),
    mission: v.mission_block.mission.value?.trim(),
    customWork: v.custom_work_block.custom_work.value?.trim(),
    startDate: v.start_date_block.start_date.selected_date,
    endDate: v.end_date_block.end_date.selected_date,
    state: v.state_block.state.selected_option?.value,
  };

  // Field-level validation surfaces errors inline in the modal.
  const errors = {};
  if (!fields.demoType) errors.demo_type_block = 'Please choose a demo type.';
  if (!fields.demoType2) errors.demo_type_2_block = 'Please choose a second demo type.';
  if (!fields.product) errors.product_block = 'Please list the product(s) needed.';
  if (!fields.startDate) errors.start_date_block = 'Please choose a start date.';
  if (!fields.endDate) errors.end_date_block = 'Please choose an end date.';
  if (!fields.state) errors.state_block = 'Please choose a state.';
  if (!fields.purpose) errors.purpose_block = 'Please enter a purpose.';
  if (!fields.mission) errors.mission_block = 'Please enter a mission set description.';
  if (!fields.customWork) errors.custom_work_block = 'Please describe the custom work needed.';
  if (
    fields.startDate &&
    fields.endDate &&
    fields.endDate < fields.startDate
  ) {
    errors.end_date_block = 'End date cannot be before the start date.';
  }

  if (Object.keys(errors).length > 0) {
    await ack({ response_action: 'errors', errors });
    return;
  }

  await ack();

  const slackUserId = body.user.id;

  // Resolve the submitter -> Salesforce User Id (matched by email) so we can
  // set the record's OwnerId. Falls back to the integration user if no match.
  let ownerId = null;
  let ownerNote = '';
  try {
    const info = await client.users.info({ user: slackUserId });
    const email = info.user?.profile?.email;
    if (email) {
      ownerId = await findUserIdByEmail(email);
    }
    if (!ownerId) {
      ownerNote =
        '\n_Note: no matching active Salesforce user was found for your ' +
        'email, so the record is owned by the integration user._';
    }
  } catch (error) {
    logger.error('Owner resolution failed', error);
    ownerNote =
      '\n_Note: could not resolve your Salesforce user, so the record is ' +
      'owned by the integration user._';
  }

  try {
    const recordId = await createAssetRequest({ ...fields, ownerId });

    await client.chat.postMessage({
      channel: slackUserId,
      text:
        `:white_check_mark: Your Asset Request was created in Salesforce.\n` +
        `• *Demo type:* ${fields.demoType}` +
        (fields.demoType2 ? ` / ${fields.demoType2}` : '') +
        `\n• *Product(s):* ${fields.product}` +
        `\n• *Dates:* ${fields.startDate} → ${fields.endDate}` +
        `\n• *State:* ${fields.state}` +
        (fields.purpose ? `\n• *Purpose:* ${fields.purpose}` : '') +
        `\n• *Record:* ${recordId}` +
        ownerNote,
    });
  } catch (error) {
    logger.error('Salesforce submission failed', error);
    await client.chat.postMessage({
      channel: slackUserId,
      text:
        `:x: Sorry, I couldn't save your Asset Request to Salesforce.\n` +
        `Please try again, or contact an admin if it keeps happening.\n` +
        `_Error: ${error.message}_`,
    });
  }
});

// ---------------------------------------------------------------------------
// Modal definition (Block Kit)
// ---------------------------------------------------------------------------
function selectOptions(values) {
  return values.map((value) => ({
    text: { type: 'plain_text', text: value },
    value,
  }));
}

function buildModal() {
  return {
    type: 'modal',
    callback_id: 'asset_request_submit',
    title: { type: 'plain_text', text: 'Asset Request' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'demo_type_block',
        label: { type: 'plain_text', text: 'Demo type' },
        element: {
          type: 'static_select',
          action_id: 'demo_type',
          placeholder: { type: 'plain_text', text: 'Select a demo type' },
          options: selectOptions(DEMO_TYPE_OPTIONS),
        },
      },
      {
        type: 'input',
        block_id: 'demo_type_2_block',
        label: { type: 'plain_text', text: 'Demo type 2' },
        element: {
          type: 'static_select',
          action_id: 'demo_type_2',
          placeholder: { type: 'plain_text', text: 'Select a demo type' },
          options: selectOptions(DEMO_TYPE_2_OPTIONS),
        },
      },
      {
        type: 'input',
        block_id: 'product_block',
        label: { type: 'plain_text', text: 'What products are needed?' },
        element: {
          type: 'plain_text_input',
          action_id: 'product',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'e.g. 20x Widget A, 5x Widget B',
          },
        },
      },
      {
        type: 'input',
        block_id: 'start_date_block',
        label: { type: 'plain_text', text: 'Start date' },
        element: {
          type: 'datepicker',
          action_id: 'start_date',
          placeholder: { type: 'plain_text', text: 'Select a date' },
        },
      },
      {
        type: 'input',
        block_id: 'end_date_block',
        label: { type: 'plain_text', text: 'End date' },
        element: {
          type: 'datepicker',
          action_id: 'end_date',
          placeholder: { type: 'plain_text', text: 'Select a date' },
        },
      },
      {
        type: 'input',
        block_id: 'state_block',
        label: { type: 'plain_text', text: 'State (location)' },
        element: {
          type: 'static_select',
          action_id: 'state',
          placeholder: { type: 'plain_text', text: 'Select a state' },
          options: US_STATES.map(([code, name]) => ({
            text: { type: 'plain_text', text: `${name} (${code})` },
            value: code,
          })),
        },
      },
      {
        type: 'input',
        block_id: 'purpose_block',
        label: { type: 'plain_text', text: 'Purpose' },
        element: {
          type: 'plain_text_input',
          action_id: 'purpose',
          multiline: true,
        },
      },
      {
        type: 'input',
        block_id: 'mission_block',
        label: { type: 'plain_text', text: 'Mission set description' },
        element: {
          type: 'plain_text_input',
          action_id: 'mission',
          multiline: true,
        },
      },
      {
        type: 'input',
        block_id: 'custom_work_block',
        label: { type: 'plain_text', text: 'Custom work needed' },
        element: {
          type: 'plain_text_input',
          action_id: 'custom_work',
          multiline: true,
        },
      },
    ],
  };
}

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ Asset Request app is running (Socket Mode) on port ${port}`);
})();
