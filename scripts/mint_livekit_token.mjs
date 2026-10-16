import { Value } from '@sinclair/typebox/value';
import { Type } from '@sinclair/typebox';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessToken } from 'livekit-server-sdk';

if (process.argv.includes('--rotate')) {
  const next = readFileSync('.env', 'utf8')
    .replace(/^LIVEKIT_API_KEY=.*$/m, `LIVEKIT_API_KEY=lk_${randomBytes(12).toString('hex')}`)
    .replace(/^LIVEKIT_API_SECRET=.*$/m, `LIVEKIT_API_SECRET=${randomBytes(32).toString('base64url')}`);
  writeFileSync('.env', next);
  console.log('Rotated credentials in .env');
}

process.loadEnvFile();

const env = Value.Decode(
  Type.Object({
    LIVEKIT_API_KEY: Type.String({ minLength: 1 }),
    LIVEKIT_API_SECRET: Type.String({ minLength: 32 }),
    LIVEKIT_ROOM: Type.String({ minLength: 1 }),
  }),
  process.env,
);

const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity: 'drone-sim', ttl: '10y' });
console.warn('WARNING: dev-only credentials — never expose this token or endpoint outside your local network.');
at.addGrant({ roomJoin: true, room: env.LIVEKIT_ROOM });
const token = await at.toJwt();

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/game/public/livekit');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  resolve(outDir, 'token.json'),
  JSON.stringify({ token, room: env.LIVEKIT_ROOM, identity: 'drone-sim' }, null, 2) + '\n',
);
console.log(`Minted token for room '${env.LIVEKIT_ROOM}' -> packages/game/public/livekit/token.json`);
