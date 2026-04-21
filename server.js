require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/', limiter);
app.use('/api/auth', authLimiter);

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./auth'));
app.use('/api/sellers',       require('./sellers'));
app.use('/api/buyers',        require('./buyers'));
app.use('/api/deals',         require('./deals'));
app.use('/api/interactions',  require('./interactions'));

const {
  contractsRouter,
  automationsRouter,
  sequencesRouter,
  tasksRouter,
  scrapeRouter,
  dashboardRouter,
} = require('./routes/misc');

app.use('/api/contracts',    contractsRouter);
app.use('/api/automations',  automationsRouter);
app.use('/api/sequences',    sequencesRouter);
app.use('/api/tasks',        tasksRouter);
app.use('/api/scrape',       scrapeRouter);
app.use('/api/dashboard',    dashboardRouter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🏠 WholesaleOS API running on port ${PORT}`);
  // Start background jobs
  require('./jobs/scheduler').startJobs();
});

module.exports = app;
