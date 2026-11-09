const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config({ quiet: true });
const routesApi = require('./routes/index.route');
const { connectDB, closeDB } = require('./config/database');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();
app.disable('x-powered-by');
app.use(cors());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));

routesApi(app);
app.use(notFoundHandler);
app.use(errorHandler);

let server = null;

/** Connect to SQL Server, then listen. Pass port 0 to get a random free port (tests). */
async function start({ port = process.env.PORT || 5000 } = {}) {
  await connectDB();
  try {
    await new Promise((resolve, reject) => {
      // Express 5 reports listen errors (e.g. EADDRINUSE) through this callback
      server = app.listen(port, (err) => (err ? reject(err) : resolve()));
      server.once('error', reject);
    });
  } catch (err) {
    server = null;
    await closeDB();
    if (err.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Set another PORT in .env (e.g. PORT=5001) or stop the program using it.`);
    }
    throw err;
  }
  if (process.env.NODE_ENV !== 'test') console.log(`Backend running at http://localhost:${server.address().port}`);
  return server;
}

async function stop() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  await closeDB();
}

if (require.main === module) {
  start().catch((err) => {
    console.error(`Backend startup failed: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { app, start, stop };
