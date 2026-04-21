const twilio = require('twilio');
const nodemailer = require('nodemailer');

let twilioClient = null;
let emailTransporter = null;

function getTwilioClient() {
  if (!twilioClient && process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

function getEmailTransporter() {
  if (!emailTransporter) {
    emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return emailTransporter;
}

async function sendSMS(to, body) {
  const client = getTwilioClient();
  if (!client) {
    console.warn('Twilio not configured — SMS skipped:', { to, body: body.substring(0, 50) });
    return { sid: 'mock_' + Date.now(), status: 'mocked' };
  }

  const message = await client.messages.create({
    body,
    to,
    from: process.env.TWILIO_PHONE_NUMBER,
  });

  return { sid: message.sid, status: message.status };
}

async function sendEmail(to, subject, htmlBody, textBody = null) {
  const transporter = getEmailTransporter();
  if (!process.env.SMTP_USER) {
    console.warn('Email not configured — email skipped:', { to, subject });
    return { messageId: 'mock_' + Date.now() };
  }

  const info = await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'WholesaleOS'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    html: htmlBody,
    text: textBody || htmlBody.replace(/<[^>]+>/g, ''),
  });

  return { messageId: info.messageId };
}

function interpolateTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

module.exports = { sendSMS, sendEmail, interpolateTemplate };
