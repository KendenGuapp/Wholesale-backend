const router = require('express').Router();
const { query } = require('./db');
const { authenticate } = require('../middleware/auth');
const messagingService = require('../services/messaging');

router.use(authenticate);

// GET /buyers
router.get('/', async (req, res) => {
  try {
    const { search, state, property_type, active, limit = 50, offset = 0 } = req.query;
    let conditions = [];
    let params = [];
    let idx = 1;

    if (active !== undefined) { conditions.push(`b.is_active = $${idx++}`); params.push(active === 'true'); }
    if (state) { conditions.push(`$${idx++} = ANY(b.preferred_states)`); params.push(state); }
    if (property_type) { conditions.push(`$${idx++} = ANY(b.property_types)`); params.push(property_type); }
    if (search) {
      conditions.push(`(b.first_name ILIKE $${idx} OR b.last_name ILIKE $${idx} OR b.company_name ILIKE $${idx} OR b.email ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT * FROM buyers b ${where} ORDER BY b.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const count = await query(`SELECT COUNT(*) FROM buyers b ${where}`, params);
    res.json({ buyers: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch buyers' });
  }
});

// GET /buyers/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM buyers WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Buyer not found' });

    const interactions = await query(
      `SELECT * FROM interactions WHERE entity_type = 'buyer' AND entity_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    const matches = await query(
      `SELECT m.*, d.property_address, d.arv, d.asking_price FROM matches m
       JOIN deals d ON m.deal_id = d.id WHERE m.buyer_id = $1 ORDER BY m.created_at DESC`,
      [req.params.id]
    );

    res.json({ buyer: result.rows[0], interactions: interactions.rows, matches: matches.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch buyer' });
  }
});

// POST /buyers
router.post('/', async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone, company_name, buy_box,
      preferred_cities, preferred_states, max_purchase_price, min_bedrooms,
      property_types, purchase_method, closes_per_month, tags, notes
    } = req.body;

    const result = await query(
      `INSERT INTO buyers (
        first_name, last_name, email, phone, company_name, buy_box,
        preferred_cities, preferred_states, max_purchase_price, min_bedrooms,
        property_types, purchase_method, closes_per_month, tags, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        first_name, last_name, email || null, phone || null, company_name || null,
        JSON.stringify(buy_box || {}),
        preferred_cities || [], preferred_states || [],
        max_purchase_price || null, min_bedrooms || null,
        property_types || [], purchase_method || null,
        closes_per_month || null, tags || [], notes || null
      ]
    );

    res.status(201).json({ buyer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create buyer' });
  }
});

// PUT /buyers/:id
router.put('/:id', async (req, res) => {
  try {
    const fields = [
      'first_name','last_name','email','phone','company_name','buy_box',
      'preferred_cities','preferred_states','max_purchase_price','min_bedrooms',
      'property_types','purchase_method','closes_per_month','is_active',
      'verified','tags','notes'
    ];

    const updates = [];
    const params = [];
    let idx = 1;

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        params.push(f === 'buy_box' ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    });

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    const result = await query(
      `UPDATE buyers SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Buyer not found' });
    res.json({ buyer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update buyer' });
  }
});

// POST /buyers/blast - Bulk deal blast
router.post('/blast', async (req, res) => {
  try {
    const { deal_id, buyer_filters = {}, message_template, channel = 'sms' } = req.body;

    if (!deal_id || !message_template) {
      return res.status(400).json({ error: 'deal_id and message_template are required' });
    }

    // Fetch deal
    const dealResult = await query('SELECT * FROM deals WHERE id = $1', [deal_id]);
    if (!dealResult.rows.length) return res.status(404).json({ error: 'Deal not found' });
    const deal = dealResult.rows[0];

    // Build buyer query with filters
    let conditions = ['is_active = true'];
    let params = [];
    let idx = 1;

    if (buyer_filters.states?.length) {
      conditions.push(`preferred_states && $${idx++}`);
      params.push(buyer_filters.states);
    }
    if (buyer_filters.property_types?.length) {
      conditions.push(`property_types && $${idx++}`);
      params.push(buyer_filters.property_types);
    }
    if (buyer_filters.max_price) {
      conditions.push(`(max_purchase_price IS NULL OR max_purchase_price >= $${idx++})`);
      params.push(buyer_filters.max_price);
    }

    const buyersResult = await query(
      `SELECT * FROM buyers WHERE ${conditions.join(' AND ')}`, params
    );

    const buyers = buyersResult.rows;
    const results = { sent: 0, failed: 0, buyer_ids: [] };

    for (const buyer of buyers) {
      try {
        // Interpolate template
        const msg = message_template
          .replace(/\{address\}/g, deal.property_address)
          .replace(/\{arv\}/g, deal.arv ? `$${Number(deal.arv).toLocaleString()}` : 'TBD')
          .replace(/\{price\}/g, deal.asking_price ? `$${Number(deal.asking_price).toLocaleString()}` : 'TBD')
          .replace(/\{buyer_name\}/g, buyer.first_name);

        if (channel === 'sms' && buyer.phone) {
          await messagingService.sendSMS(buyer.phone, msg);
        } else if (channel === 'email' && buyer.email) {
          await messagingService.sendEmail(buyer.email, `Deal Alert: ${deal.property_address}`, msg);
        }

        // Log match
        await query(
          `INSERT INTO matches (deal_id, buyer_id, status, sent_at) VALUES ($1,$2,'sent',NOW())
           ON CONFLICT (deal_id, buyer_id) DO UPDATE SET status='sent', sent_at=NOW()`,
          [deal_id, buyer.id]
        );

        // Log interaction
        await query(
          `INSERT INTO interactions (entity_type, entity_id, deal_id, user_id, type, direction, body)
           VALUES ('buyer', $1, $2, $3, $4, 'outbound', $5)`,
          [buyer.id, deal_id, req.user.id, channel, msg]
        );

        results.sent++;
        results.buyer_ids.push(buyer.id);
      } catch (err) {
        console.error(`Failed to send to buyer ${buyer.id}:`, err.message);
        results.failed++;
      }
    }

    res.json({ success: true, results, total_buyers: buyers.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blast failed' });
  }
});

module.exports = router;
