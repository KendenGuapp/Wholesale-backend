const { query } = require('../db');

const PURCHASE_AGREEMENT_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { text-align: center; font-size: 18px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 10px; }
    h2 { font-size: 14px; text-transform: uppercase; margin-top: 20px; }
    .field { border-bottom: 1px solid #333; display: inline-block; min-width: 200px; }
    .section { margin: 20px 0; }
    .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
    .sig-block { width: 45%; }
    .sig-line { border-top: 1px solid #000; margin-top: 40px; }
  </style>
</head>
<body>
  <h1>Real Estate Purchase Agreement</h1>

  <div class="section">
    <p>This Real Estate Purchase Agreement ("Agreement") is entered into as of <span class="field">{{close_date}}</span>, between:</p>
    <p><strong>SELLER:</strong> <span class="field">{{seller_name}}</span> ("Seller")</p>
    <p><strong>BUYER/ASSIGNEE:</strong> <span class="field">{{buyer_name}}</span> and/or Assigns ("Buyer")</p>
  </div>

  <h2>1. Property</h2>
  <div class="section">
    <p>Seller agrees to sell and Buyer agrees to purchase the real property located at:</p>
    <p><strong>{{property_address}}</strong><br>{{property_city}}, {{property_state}} {{property_zip}}</p>
    <p>Legal Description: {{legal_description}}</p>
  </div>

  <h2>2. Purchase Price</h2>
  <div class="section">
    <p>The total purchase price is <strong>${{purchase_price}}</strong> ({{purchase_price_words}} Dollars), payable as follows:</p>
    <p>Earnest Money Deposit: ${{earnest_money}} due within 3 business days of acceptance.</p>
    <p>Balance due at closing via wire transfer or certified funds.</p>
  </div>

  <h2>3. Closing Date</h2>
  <div class="section">
    <p>Closing shall occur on or before <span class="field">{{close_date}}</span>, or as mutually agreed in writing.</p>
  </div>

  <h2>4. Inspection Period</h2>
  <div class="section">
    <p>Buyer shall have {{inspection_period}} calendar days from acceptance to inspect the property and, at Buyer's sole discretion, terminate this Agreement and receive a full refund of earnest money.</p>
  </div>

  <h2>5. Assignment</h2>
  <div class="section">
    <p>This Agreement is assignable by Buyer without prior written consent of Seller. Buyer may assign all rights and obligations under this Agreement to any third party.</p>
  </div>

  <h2>6. Property Condition</h2>
  <div class="section">
    <p>Property is sold AS-IS, WHERE-IS. Seller makes no representations or warranties regarding the condition of the property. Buyer accepts property in its present condition.</p>
  </div>

  <h2>7. Closing Costs</h2>
  <div class="section">
    <p>Each party shall pay their own closing costs unless otherwise agreed. Seller shall pay any outstanding liens, taxes, and encumbrances at closing.</p>
  </div>

  <h2>8. Entire Agreement</h2>
  <div class="section">
    <p>This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements.</p>
  </div>

  <p style="font-size:11px; color:#888; margin-top:30px;">This is a template document. Consult a licensed real estate attorney for legal advice.</p>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line"></div>
      <p>Seller: {{seller_name}}</p>
      <p>Date: _______________</p>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <p>Buyer: {{buyer_name}}</p>
      <p>Date: _______________</p>
    </div>
  </div>
</body>
</html>
`;

const ASSIGNMENT_AGREEMENT_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { text-align: center; font-size: 18px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 10px; }
    h2 { font-size: 14px; text-transform: uppercase; margin-top: 20px; }
    .field { border-bottom: 1px solid #333; display: inline-block; min-width: 200px; }
    .section { margin: 20px 0; }
    .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
    .sig-block { width: 45%; }
    .sig-line { border-top: 1px solid #000; margin-top: 40px; }
  </style>
</head>
<body>
  <h1>Assignment of Real Estate Purchase Agreement</h1>

  <div class="section">
    <p>This Assignment Agreement ("Assignment") is entered into as of <span class="field">{{assignment_date}}</span>, by and between:</p>
    <p><strong>ASSIGNOR:</strong> <span class="field">{{assignor_name}}</span> ("Assignor")</p>
    <p><strong>ASSIGNEE:</strong> <span class="field">{{buyer_name}}</span> ("Assignee")</p>
  </div>

  <h2>1. Assignment</h2>
  <div class="section">
    <p>For good and valuable consideration, the receipt and sufficiency of which is hereby acknowledged, Assignor hereby assigns to Assignee all of Assignor's right, title, and interest in and to that certain Real Estate Purchase Agreement dated <span class="field">{{original_contract_date}}</span>, for the property located at:</p>
    <p><strong>{{property_address}}</strong><br>{{property_city}}, {{property_state}} {{property_zip}}</p>
  </div>

  <h2>2. Assignment Fee</h2>
  <div class="section">
    <p>As consideration for this Assignment, Assignee agrees to pay Assignor an Assignment Fee of <strong>${{assignment_fee}}</strong> ({{assignment_fee_words}} Dollars), payable at closing.</p>
  </div>

  <h2>3. Assumption</h2>
  <div class="section">
    <p>Assignee hereby assumes all obligations of Assignor under the Original Purchase Agreement from the date of this Assignment forward, including but not limited to the obligation to close on the purchase of the Property.</p>
  </div>

  <h2>4. Original Earnest Money</h2>
  <div class="section">
    <p>The original earnest money deposit of ${{earnest_money}} shall be credited to Assignee at closing.</p>
  </div>

  <h2>5. Representations</h2>
  <div class="section">
    <p>Assignee represents that they have reviewed the Original Purchase Agreement and the property, and are satisfied with the terms and condition thereof.</p>
  </div>

  <p style="font-size:11px; color:#888; margin-top:30px;">This is a template document. Consult a licensed real estate attorney for legal advice.</p>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line"></div>
      <p>Assignor: {{assignor_name}}</p>
      <p>Date: _______________</p>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <p>Assignee: {{buyer_name}}</p>
      <p>Date: _______________</p>
    </div>
  </div>
</body>
</html>
`;

function renderTemplate(template, fields) {
  let html = template;
  for (const [key, value] of Object.entries(fields)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(regex, value || '___________');
  }
  return html;
}

function numberToWords(num) {
  if (!num) return 'Zero';
  // Simple implementation for dollar amounts
  const n = Math.round(Number(num));
  if (n >= 1000000) return `${Math.floor(n/1000000)} Million ${numberToWords(n%1000000)}`;
  if (n >= 1000) return `${Math.floor(n/1000)} Thousand ${numberToWords(n%1000)}`;
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (n < 20) return ones[n];
  return `${tens[Math.floor(n/10)]} ${ones[n%10]}`.trim();
}

async function generateContract(contractData) {
  const {
    type, deal_id, seller_id, buyer_id,
    purchase_price, assignment_fee, earnest_money,
    close_date, inspection_period = 10,
    created_by
  } = contractData;

  // Fetch related data
  const [dealRes, sellerRes, buyerRes] = await Promise.all([
    query('SELECT * FROM deals WHERE id = $1', [deal_id]),
    seller_id ? query('SELECT * FROM sellers WHERE id = $1', [seller_id]) : { rows: [{}] },
    buyer_id ? query('SELECT * FROM buyers WHERE id = $1', [buyer_id]) : { rows: [{}] },
  ]);

  const deal = dealRes.rows[0] || {};
  const seller = sellerRes.rows[0] || {};
  const buyer = buyerRes.rows[0] || {};

  const fields = {
    property_address: deal.property_address || '',
    property_city: deal.property_city || '',
    property_state: deal.property_state || '',
    property_zip: deal.property_zip || '',
    seller_name: seller_id ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim() : 'Seller',
    buyer_name: buyer_id ? `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() : 'Buyer/Assignee',
    assignor_name: 'WholesaleOS Investor, LLC', // your company
    purchase_price: purchase_price ? Number(purchase_price).toLocaleString() : '',
    purchase_price_words: numberToWords(purchase_price),
    assignment_fee: assignment_fee ? Number(assignment_fee).toLocaleString() : '',
    assignment_fee_words: numberToWords(assignment_fee),
    earnest_money: earnest_money ? Number(earnest_money).toLocaleString() : '500',
    close_date: close_date || '',
    assignment_date: new Date().toLocaleDateString(),
    original_contract_date: close_date || '',
    inspection_period: String(inspection_period),
    legal_description: 'See attached legal description',
  };

  const template = type === 'assignment_agreement' ? ASSIGNMENT_AGREEMENT_TEMPLATE : PURCHASE_AGREEMENT_TEMPLATE;
  const html_content = renderTemplate(template, fields);

  // Save to DB
  const result = await query(
    `INSERT INTO contracts (deal_id, type, seller_id, buyer_id, purchase_price, assignment_fee,
       earnest_money, close_date, inspection_period, fields, html_content, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      deal_id, type, seller_id || null, buyer_id || null,
      purchase_price || null, assignment_fee || null, earnest_money || null,
      close_date || null, inspection_period,
      JSON.stringify(fields), html_content, created_by
    ]
  );

  return result.rows[0];
}

module.exports = { generateContract, renderTemplate };
