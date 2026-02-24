const crypto = require('crypto');
require('dotenv').config();

const playbackId = 'BmVMmy5X2jXfhoi01m5Xet7ass34E02L8cTIV3Clfl3dw'; // much vs very
const signingKeyId = process.env.MUX_SIGNING_KEY_ID;
let privateKey = process.env.MUX_PRIVATE_KEY;

if (privateKey) {
   privateKey = privateKey.replace(/\\n/g, '\n');
}

const header = { alg: 'RS256', typ: 'JWT', kid: signingKeyId };
const now = Math.floor(Date.now() / 1000);
const payload = { sub: playbackId, aud: 'v', exp: now + 600 };

const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
const input = `${base64Header}.${base64Payload}`;

const signer = crypto.createSign('RSA-SHA256');
signer.update(input);
const signature = signer.sign(privateKey, 'base64url');

const token = `${input}.${signature}`;
console.log(`URL: https://stream.mux.com/${playbackId}.m3u8?token=${token}`);
