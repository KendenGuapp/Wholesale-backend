/**
 * AI Deal Scoring Engine
 * Weighted multi-factor scoring system (0-100)
 * No external ML dependencies - pure algorithmic scoring
 */

const WEIGHTS = {
  spread:         0.35,  // ARV vs asking price spread (most important)
  motivation:     0.25,  // Seller motivation level
  condition:      0.20,  // Property condition
  recency:        0.10,  // Days since last contact (freshness)
  repair_ratio:   0.10,  // Repair cost ratio
};

const CONDITION_SCORES = {
  'excellent': 100,
  'good':      80,
  'fair':      55,
  'poor':      30,
  'teardown':  10,
};

/**
 * Score a deal given inputs
 * @param {object} inputs
 * @returns {{ score: number, label: string, breakdown: object, recommendations: string[] }}
 */
function scoreDeal(inputs) {
  const {
    arv,
    asking_price,
    estimated_repairs,
    condition,
    motivation_level,   // 1-10
    days_since_contact = 0,
  } = inputs;

  const breakdown = {};
  const recommendations = [];

  // ── 1. SPREAD SCORE (ARV vs Asking Price) ────────────────────────────
  let spreadScore = 0;
  if (arv && asking_price) {
    const spread = (arv - asking_price) / arv;
    // Perfect deal: 40%+ spread → 100 pts
    // At 70% ARV → 30% spread → ~75 pts
    // At 85% ARV → 15% spread → ~37 pts
    // Negative spread → 0
    if (spread >= 0.40) spreadScore = 100;
    else if (spread > 0) spreadScore = Math.round((spread / 0.40) * 100);
    else spreadScore = 0;

    breakdown.spread = {
      arv: Number(arv),
      asking_price: Number(asking_price),
      spread_pct: Math.round(spread * 100),
      score: spreadScore
    };

    if (spread < 0.30) recommendations.push('Negotiate asking price lower — spread is thin');
    if (spread >= 0.40) recommendations.push('Excellent spread — prioritize this deal immediately');
  } else {
    spreadScore = 40; // neutral if unknown
    breakdown.spread = { score: spreadScore, note: 'Insufficient data' };
    recommendations.push('Get ARV and asking price to improve score accuracy');
  }

  // ── 2. MOTIVATION SCORE ──────────────────────────────────────────────
  let motivationScore = 0;
  if (motivation_level) {
    motivationScore = Math.round((motivation_level / 10) * 100);
    breakdown.motivation = { level: motivation_level, score: motivationScore };
    if (motivation_level <= 4) recommendations.push('Low motivation — seller may not be ready. Consider follow-up sequence.');
    if (motivation_level >= 8) recommendations.push('High motivation seller — move quickly');
  } else {
    motivationScore = 50;
    breakdown.motivation = { score: motivationScore, note: 'Not assessed' };
  }

  // ── 3. CONDITION SCORE ───────────────────────────────────────────────
  let conditionScore = CONDITION_SCORES[condition] || 50;
  breakdown.condition = { condition, score: conditionScore };
  if (condition === 'poor' || condition === 'teardown') {
    recommendations.push('Heavy rehab needed — verify repair estimate carefully');
  }

  // ── 4. RECENCY SCORE (freshness of contact) ──────────────────────────
  let recencyScore = 0;
  const days = parseInt(days_since_contact) || 0;
  if (days === 0) recencyScore = 100;
  else if (days <= 1)  recencyScore = 90;
  else if (days <= 3)  recencyScore = 75;
  else if (days <= 7)  recencyScore = 55;
  else if (days <= 14) recencyScore = 35;
  else if (days <= 30) recencyScore = 15;
  else recencyScore = 5;

  breakdown.recency = { days_since_contact: days, score: recencyScore };
  if (days > 7) recommendations.push(`No contact in ${days} days — follow up immediately`);

  // ── 5. REPAIR RATIO SCORE ────────────────────────────────────────────
  let repairScore = 50;
  if (arv && estimated_repairs) {
    const repairRatio = estimated_repairs / arv;
    // Low ratio = better deal
    if (repairRatio <= 0.05) repairScore = 100;
    else if (repairRatio <= 0.10) repairScore = 85;
    else if (repairRatio <= 0.20) repairScore = 65;
    else if (repairRatio <= 0.30) repairScore = 40;
    else repairScore = 20;

    breakdown.repair_ratio = {
      estimated_repairs: Number(estimated_repairs),
      arv: Number(arv),
      ratio_pct: Math.round(repairRatio * 100),
      score: repairScore
    };

    if (repairRatio > 0.25) recommendations.push('High repair ratio — ensure buyers are experienced rehabbers');
  } else {
    breakdown.repair_ratio = { score: repairScore, note: 'Not calculated' };
  }

  // ── WEIGHTED TOTAL ───────────────────────────────────────────────────
  const raw =
    spreadScore    * WEIGHTS.spread +
    motivationScore * WEIGHTS.motivation +
    conditionScore  * WEIGHTS.condition +
    recencyScore    * WEIGHTS.recency +
    repairScore     * WEIGHTS.repair_ratio;

  const score = Math.min(100, Math.max(0, Math.round(raw)));

  // ── LABEL ─────────────────────────────────────────────────────────────
  let label;
  if (score >= 80) label = 'hot';
  else if (score >= 60) label = 'high';
  else if (score >= 35) label = 'medium';
  else label = 'low';

  // ── MAO CALCULATION ───────────────────────────────────────────────────
  let mao = null;
  let mao_formula = null;
  if (arv && estimated_repairs) {
    mao = Math.round(arv * 0.70 - estimated_repairs);
    mao_formula = `ARV ($${Number(arv).toLocaleString()}) × 70% - Repairs ($${Number(estimated_repairs).toLocaleString()}) = $${mao.toLocaleString()}`;
  }

  return {
    score,
    label,
    breakdown,
    recommendations,
    mao,
    mao_formula,
    weights: WEIGHTS,
  };
}

module.exports = { scoreDeal };
