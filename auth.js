const { query } = require('../db');
const messagingService = require('./messaging');

/**
 * Automation Engine
 * Executes rule-based automations triggered by system events
 */

const TRIGGER_HANDLERS = {
  new_seller:        handleNewSeller,
  deal_created:      handleDealCreated,
  deal_scored_high:  handleDealScoredHigh,
  no_reply_48h:      handleNoReply,
  seller_status_change: handleSellerStatusChange,
};

/**
 * Trigger automations for a given event
 */
async function triggerAutomation(event, context = {}) {
  try {
    const result = await query(
      `SELECT * FROM automations WHERE trigger_event = $1 AND active = true`,
      [event]
    );

    for (const automation of result.rows) {
      try {
        await executeAutomation(automation, context);
        await query(
          `UPDATE automations SET run_count = run_count + 1, last_run_at = NOW() WHERE id = $1`,
          [automation.id]
        );
      } catch (err) {
        console.error(`Automation ${automation.name} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('triggerAutomation error:', err.message);
  }
}

async function executeAutomation(automation, context) {
  const action = automation.action;
  console.log(`[Automation] Running "${automation.name}" — action: ${action.type}`);

  switch (action.type) {
    case 'assign_sequence':
      if (context.seller) {
        await enrollInSequence(action.sequence_id, 'seller', context.seller.id);
      }
      break;

    case 'create_task':
      await query(
        `INSERT INTO tasks (title, description, type, priority, entity_type, entity_id, deal_id, assigned_to, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '${action.due_in_hours || 24} hours')`,
        [
          action.title || 'Follow up',
          action.description || '',
          action.task_type || 'follow_up',
          action.priority || 'medium',
          context.seller ? 'seller' : 'buyer',
          context.seller?.id || context.buyer?.id,
          context.deal?.id || null,
          action.assigned_to || context.user?.id || null,
        ]
      );
      break;

    case 'send_notification':
      console.log(`[Notification] ${action.message}`);
      break;

    case 'run_matching':
      if (context.deal?.id) {
        const { matchBuyers } = require('./matching');
        await matchBuyers(context.deal.id);
      }
      break;

    default:
      console.warn(`Unknown automation action type: ${action.type}`);
  }
}

async function enrollInSequence(sequenceId, entityType, entityId) {
  const seq = await query('SELECT * FROM message_sequences WHERE id = $1', [sequenceId]);
  if (!seq.rows.length) return;

  // Get first step timing
  const firstStep = await query(
    `SELECT * FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_number ASC LIMIT 1`,
    [sequenceId]
  );

  const delayHours = firstStep.rows[0]?.delay_hours || 0;
  const nextRun = new Date(Date.now() + delayHours * 3600000);

  await query(
    `INSERT INTO sequence_enrollments (sequence_id, entity_type, entity_id, current_step, next_run_at)
     VALUES ($1, $2, $3, 0, $4)
     ON CONFLICT DO NOTHING`,
    [sequenceId, entityType, entityId, nextRun]
  );
}

// ── SPECIFIC HANDLERS ─────────────────────────────────────────────────────────

async function handleNewSeller(automation, context) {
  // Default: create follow-up task
  if (context.seller) {
    await query(
      `INSERT INTO tasks (title, type, priority, entity_type, entity_id, assigned_to, due_date)
       VALUES ('Initial contact: ' || $1, 'call', 'high', 'seller', $2, $3, NOW() + INTERVAL '1 hour')`,
      [
        `${context.seller.first_name} ${context.seller.last_name}`,
        context.seller.id,
        context.user?.id
      ]
    );
  }
}

async function handleDealCreated(automation, context) {
  if (context.deal) {
    const { matchBuyers } = require('./matching');
    await matchBuyers(context.deal.id);
  }
}

async function handleDealScoredHigh(automation, context) {
  console.log(`[Alert] HIGH SCORE DEAL: ${context.deal?.property_address} — Score: ${context.deal?.score}`);
}

async function handleNoReply(automation, context) {
  // Handled by cron job
}

async function handleSellerStatusChange(automation, context) {
  console.log(`[Status Change] Seller ${context.seller?.id} → ${context.seller?.status}`);
}

module.exports = { triggerAutomation, enrollInSequence };
