const axios = require('axios');
const cheerio = require('cheerio');
const { query } = require('../db');

/**
 * Scraping Framework
 * Supports configurable URL scraping with normalization and deduplication
 */

const USER_AGENT = 'Mozilla/5.0 (compatible; WholesaleOS/1.0; +https://wholesaleos.com)';

// ── SCRAPERS ──────────────────────────────────────────────────────────────────

const SCRAPER_REGISTRY = {
  craigslist: scrapeCraigslist,
  generic:    scrapeGeneric,
};

async function scrapeGeneric(url, config = {}) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 15000,
  });

  const $ = cheerio.load(data);
  const listings = [];

  // Generic extraction — override with site-specific selectors
  const itemSelector = config.item_selector || 'li, .result, .listing, article';
  const titleSelector = config.title_selector || 'h2, h3, .title';
  const priceSelector = config.price_selector || '.price, [class*="price"]';
  const addressSelector = config.address_selector || '.address, [class*="address"], [class*="location"]';

  $(itemSelector).each((i, el) => {
    const title = $(el).find(titleSelector).first().text().trim();
    const price = $(el).find(priceSelector).first().text().trim();
    const address = $(el).find(addressSelector).first().text().trim();
    const link = $(el).find('a').first().attr('href');

    if (title) {
      listings.push({ title, price, address, link, source_url: url });
    }
  });

  return listings;
}

async function scrapeCraigslist(url, config = {}) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 15000,
  });

  const $ = cheerio.load(data);
  const listings = [];

  $('.result-row, li.result-row').each((i, el) => {
    const title = $(el).find('.result-title').text().trim();
    const price = $(el).find('.result-price').text().trim();
    const hood = $(el).find('.result-hood').text().trim().replace(/[()]/g, '');
    const link = $(el).find('a.result-title').attr('href');
    const date = $(el).find('time').attr('datetime');

    if (title) {
      listings.push({
        title,
        price: parsePrice(price),
        neighborhood: hood,
        link,
        posted_at: date,
        source_url: url,
      });
    }
  });

  return listings;
}

// ── NORMALIZATION ─────────────────────────────────────────────────────────────

function parsePrice(priceStr) {
  if (!priceStr) return null;
  const num = priceStr.replace(/[^0-9.]/g, '');
  return num ? parseFloat(num) : null;
}

function normalizeToSeller(raw, leadSourceId) {
  // Best-effort normalization from scraped data
  const parts = (raw.title || '').split(/[-,|]/);
  const addressGuess = raw.address || raw.neighborhood || '';

  return {
    first_name: 'Scraped',
    last_name: 'Lead',
    property_address: addressGuess || raw.title?.substring(0, 100) || 'Unknown',
    asking_price: raw.price || null,
    notes: `Scraped from: ${raw.source_url}\nTitle: ${raw.title}\nLink: ${raw.link}`,
    lead_source_id: leadSourceId,
    status: 'new',
    tags: ['scraped'],
  };
}

// ── DEDUPLICATION ─────────────────────────────────────────────────────────────

async function isDuplicate(raw) {
  if (!raw.link) return false;
  const result = await query(
    `SELECT id FROM scraped_data WHERE raw_data->>'link' = $1`,
    [raw.link]
  );
  return result.rows.length > 0;
}

// ── MAIN RUN FUNCTION ─────────────────────────────────────────────────────────

async function runScraper(sourceId, url, scraperType = 'generic', config = {}) {
  console.log(`[Scraper] Starting ${scraperType} scrape of ${url}`);

  let listings = [];
  try {
    const scraperFn = SCRAPER_REGISTRY[scraperType] || scrapeGeneric;
    listings = await scraperFn(url, config);
    console.log(`[Scraper] Got ${listings.length} raw listings`);
  } catch (err) {
    console.error('[Scraper] Fetch error:', err.message);
    throw new Error(`Scraping failed: ${err.message}`);
  }

  const results = { total: listings.length, saved: 0, duplicates: 0, sellers_created: 0 };

  for (const raw of listings) {
    try {
      // Dedup check
      if (await isDuplicate(raw)) {
        results.duplicates++;
        continue;
      }

      // Save raw data
      const savedRaw = await query(
        `INSERT INTO scraped_data (lead_source_id, raw_data, processed)
         VALUES ($1, $2, false) RETURNING id`,
        [sourceId, JSON.stringify(raw)]
      );
      results.saved++;

      // Normalize and create seller if auto-import enabled
      if (config.auto_import) {
        const sellerData = normalizeToSeller(raw, sourceId);
        const sellerResult = await query(
          `INSERT INTO sellers (first_name, last_name, property_address, asking_price, notes, lead_source_id, status, tags)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            sellerData.first_name, sellerData.last_name,
            sellerData.property_address, sellerData.asking_price,
            sellerData.notes, sellerData.lead_source_id,
            sellerData.status, sellerData.tags
          ]
        );

        if (sellerResult.rows.length) {
          await query(
            `UPDATE scraped_data SET processed = true, seller_id = $1, processed_at = NOW() WHERE id = $2`,
            [sellerResult.rows[0].id, savedRaw.rows[0].id]
          );
          results.sellers_created++;
        }
      }
    } catch (err) {
      console.error('[Scraper] Row error:', err.message);
    }
  }

  return results;
}

async function getScrapedResults(limit = 50, processed = null) {
  let where = '';
  let params = [limit];
  if (processed !== null) {
    where = 'WHERE processed = $2';
    params.push(processed);
  }
  const result = await query(
    `SELECT sd.*, ls.name as source_name
     FROM scraped_data sd
     LEFT JOIN lead_sources ls ON sd.lead_source_id = ls.id
     ${where}
     ORDER BY sd.created_at DESC LIMIT $1`,
    params
  );
  return result.rows;
}

module.exports = { runScraper, getScrapedResults, normalizeToSeller };
