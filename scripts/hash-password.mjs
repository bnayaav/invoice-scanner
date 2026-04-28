// scripts/hash-password.mjs
// Run:  node scripts/hash-password.mjs "your-password"
// Pastes a hash you can use directly in seed.sql for a new user.

import { webcrypto as crypto } from 'node:crypto';

const password = process.argv[2];
if (!password) { console.error('Usage: node scripts/hash-password.mjs "your-password"'); process.exit(1); }

const enc = new TextEncoder();
const ITER = 200_000;
const KEY_LEN = 32;

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
  key, KEY_LEN * 8
);

console.log(`${b64url(salt)}:${ITER}:${b64url(bits)}`);
