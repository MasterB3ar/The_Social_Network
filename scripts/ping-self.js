require('dotenv').config();

const url = process.env.TSN_PING_URL || process.env.RENDER_EXTERNAL_URL || '';

if (!url) {
  console.error('Set TSN_PING_URL to your TSN website URL, for example: https://your-site.onrender.com/api/ping');
  process.exit(1);
}

const target = url.endsWith('/api/ping') ? url : `${url.replace(/\/+$/, '')}/api/ping`;

fetch(target, { method: 'GET', headers: { 'User-Agent': 'TSN-keep-awake/1.0' } })
  .then(async (response) => {
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
    console.log(`Ping OK: ${target}`);
  })
  .catch((error) => {
    console.error(`Ping failed: ${error.message}`);
    process.exit(1);
  });
