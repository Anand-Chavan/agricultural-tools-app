import path from 'node:path';
import { config } from 'dotenv';
import { createApp } from './app.js';

config({ path: path.resolve(process.cwd(), '../../.env') });
config();

const port = Number(process.env.API_PORT || 4000);
const host = process.env.API_HOST || '0.0.0.0';
const app = createApp();

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
