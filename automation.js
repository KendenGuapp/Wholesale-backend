const { query } = require('../db');

/**
 * Matching Engine — finds best buyers for a deal
 * Scores each buyer 0-100 against deal criteria
 */
async function matchBuyers(dealId) {
  const dealResult = await query('SELECT * FROM deals WHERE id = $1', [dealId]);
  if (!dealResult.rows.length) throw new Error('Deal not found');
  const deal = dealResult.rows[0];

  // Get all active buyers
  const buyersResult = await query('SELECT * FROM buyers WHERE is_active = true');
  const buyers = buyersResult.rows;

  const matches = [];

  for (const buyer of buyers) {
    const { score, reasons } = scoreBuyerMatch(deal, buyer);
    if (score > 0) {
      matches.push({ buyer_id: buyer.id, score, reasons });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  // Upsert top matches into DB
  for (const match of matches.slice(0, 20)) {
    await query(
      `INSERT INTO matches (deal_id, buyer_id, match_score, match_reasons, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (deal_id, buyer_id) DO UPDATE
         SET match_score = EXCLUDED.match_score,
             match_reasons = EXCLUDED.match_reasons`,
      [dealId, match.buyer_id, match.score, JSON.stringify(match.reasons)]
    );
  }

  return matches;
}

function scoreBuyerMatch(deal, buyer) {
  let score = 0;
  const reasons = [];

  // State match
  if (buyer.preferred_states?.length && deal.property_state) {
    if (buyer.preferred_states.includes(deal.property_state)) {
      score += 30;
      reasons.push({ factor: 'state_match', points: 30, detail: `Buyer buys in ${deal.property_state}` });
    } else {
      return { score: 0, reasons: [{ factor: 'state_miss', points: -100, detail: 'State not in buy box' }] };
    }
  } else {
    score += 15; // partial credit if no state preference
    reasons.push({ factor: 'state_open', points: 15, detail: 'Buyer buys nationwide' });
  }

  // Property type match
  if (buyer.property_types?.length && deal.property_type) {
    if (buyer.property_types.includes(deal.property_type)) {
      score += 20;
      reasons.push({ factor: 'type_match', points: 20, detail: `Buyer wants ${deal.property_type}` });
    } else {
      score -= 20;
      reasons.push({ factor: 'type_miss', points: -20, detail: `Buyer prefers different property type` });
    }
  } else {
    score += 10;
  }

  // Price match
  if (buyer.max_purchase_price && deal.asking_price) {
    if (deal.asking_price <= buyer.max_purchase_price) {
      const headroom = (buyer.max_purchase_price - deal.asking_price) / buyer.max_purchase_price;
      const pts = Math.min(25, Math.round(headroom * 50));
      score += pts;
      reasons.push({ factor: 'price_match', points: pts, detail: `Within buyer max of $${Number(buyer.max_purchase_price).toLocaleString()}` });
    } else {
      return { score: 0, reasons: [{ factor: 'price_exceed', points: -100, detail: 'Exceeds buyer max price' }] };
    }
  } else {
    score += 12;
  }

  // Bedrooms
  if (buyer.min_bedrooms && deal.bedrooms) {
    if (deal.bedrooms >= buyer.min_bedrooms) {
      score += 15;
      reasons.push({ factor: 'beds_match', points: 15, detail: `${deal.bedrooms} beds meets min of ${buyer.min_bedrooms}` });
    } else {
      score -= 10;
    }
  }

  // Bonus: verified buyer
  if (buyer.verified) {
    score += 10;
    reasons.push({ factor: 'verified', points: 10, detail: 'POF verified buyer' });
  }

  // Bonus: active recent buyer
  if (buyer.total_deals >= 3) {
    score += 5;
    reasons.push({ factor: 'experienced', points: 5, detail: `${buyer.total_deals} deals closed` });
  }

  score = Math.min(100, Math.max(0, score));
  return { score, reasons };
}

module.exports = { matchBuyers, scoreBuyerMatch };
