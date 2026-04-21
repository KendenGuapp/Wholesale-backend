const router = require('express').Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { scoreDeal } = require('../services/scoring');

router.use(authenticate);

// GET /sellers
router.get('/', async (req, res) => {
  try {
    const { status, state, search, limit = 50, offset = 0 } = req.query;
    let conditions = [];
    let params = [];
    let idx = 1;

    if (status) { conditions.push(`s.status = $${idx++}`); params.push(status); }
    if (state) { conditions.push(`s.property_state = $${idx++}`); params.push(state); }
    if (search) {
      conditions.push(`(s.first_name ILIKE $${idx} OR s.last_name ILIKE $${idx} OR s.property_address ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT s.*, u.name as assigned_name, ls.name as source_name
       FROM sellers s
       LEFT JOIN users u ON s.assigned_to = u.id
       LEFT JOIN lead_sources ls ON s.lead_source_id = ls.id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const count = await query(
      `SELECT COUNT(*) FROM sellers s ${where}`, params
    );

    res.json({ sellers: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sellers' });
  }
});

// GET /sellers/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, u.name as assigned_name, ls.name as source_name
       FROM sellers s
       LEFT JOIN users u ON s.assigned_to = u.id
       LEFT JOIN lead_sources ls ON s.lead_source_id = ls.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Seller not found' });

    // Get interactions
    const interactions = await query(
      `SELECT * FROM interactions WHERE entity_type = 'seller' AND entity_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );

    // Get tasks
    const tasks = await query(
      `SELECT * FROM tasks WHERE entity_type = 'seller' AND entity_id = $1 ORDER BY due_date ASC`,
      [req.params.id]
    );

    res.json({ seller: result.rows[0], interactions: interactions.rows, tasks: tasks.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch seller' });
  }
});

// POST /sellers
router.post('/', async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone, address, city, state, zip,
      property_address, property_city, property_state, property_zip,
      property_type, bedrooms, bathrooms, sqft, year_built, condition,
      asking_price, arv, estimated_repairs, motivation_level, motivation_notes,
      timeline, lead_source_id, tags, notes
    } = req.body;

    const result = await query(
      `INSERT INTO sellers (
        first_name, last_name, email, phone, address, city, state, zip,
        property_address, property_city, property_state, property_zip,
        property_type, bedrooms, bathrooms, sqft, year_built, condition,
        asking_price, arv, estimated_repairs, motivation_level, motivation_notes,
        timeline, lead_source_id, assigned_to, tags, notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28
      ) RETURNING *`,
      [
        first_name, last_name, email || null, phone || null,
        address || null, city || null, state || null, zip || null,
        property_address, property_city || null, property_state || null, property_zip || null,
        property_type || null, bedrooms || null, bathrooms || null, sqft || null,
        year_built || null, condition || null,
        asking_price || null, arv || null, estimated_repairs || null,
        motivation_level || null, motivation_notes || null, timeline || null,
        lead_source_id || null, req.user.id, tags || [], notes || null
      ]
    );

    const seller = result.rows[0];

    // Trigger automations
    const { triggerAutomation } = require('../services/automation');
    triggerAutomation('new_seller', { seller, user: req.user }).catch(console.error);

    res.status(201).json({ seller });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create seller' });
  }
});

// PUT /sellers/:id
router.put('/:id', async (req, res) => {
  try {
    const fields = [
      'first_name','last_name','email','phone','property_address','property_city',
      'property_state','property_zip','property_type','bedrooms','bathrooms','sqft',
      'year_built','condition','asking_price','arv','estimated_repairs',
      'motivation_level','motivation_notes','timeline','status','tags','notes',
      'assigned_to','last_contacted_at'
    ];

    const updates = [];
    const params = [];
    let idx = 1;

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        params.push(req.body[f]);
      }
    });

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    const result = await query(
      `UPDATE sellers SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Seller not found' });
    res.json({ seller: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update seller' });
  }
});

// DELETE /sellers/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM sellers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete seller' });
  }
});

module.exports = router;
