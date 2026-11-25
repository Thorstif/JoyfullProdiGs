import fs from 'node:fs';
import path from 'node:path';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

export const config = {
  port: Number(process.env.PORT || 3000),
  tz: process.env.TZ || 'Europe/Oslo',
  appName: process.env.APP_NAME || 'JoyfullProdiGs',
  gmPin: process.env.GM_PIN || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:gm@example.com',
  vapidPublic: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || '',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  production: process.env.NODE_ENV === 'production',
  // Optional: autopilot switches itself on at TRIP_START, final standings go out at FINAL_AT.
  // ISO time with offset, e.g. 2026-11-27T12:00:00+01:00
  tripStart: process.env.TRIP_START || '',
  finalAt: process.env.FINAL_AT || '',
};

if (!config.gmPin) {
  console.warn('[config] GM_PIN is not set. The Game Master panel is locked until you set it in .env.');
}
