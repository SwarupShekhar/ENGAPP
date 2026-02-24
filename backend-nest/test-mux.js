const jwt = require('jsonwebtoken');
require('dotenv').config();

const playbackId = 'BmVMmy5X2jXfhoi01m5Xet7ass34E02L8cTIV3Clfl3dw'; // from Strapi response

const signingKeyId = process.env.MUX_SIGNING_KEY_ID;
let privateKey = process.env.MUX_PRIVATE_KEY;

if (privateKey) {
   privateKey = privateKey.replace(/\\n/g, '\n');
}

console.log('Key length:', privateKey?.length);

const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: signingKeyId,
};

const now = Math.floor(Date.now() / 1000);
const payload = {
    sub: playbackId,
    aud: 'v',
    exp: now + 600,
};

try {
    const token = jwt.sign(payload, privateKey, { header });
    console.log(`https://stream.mux.com/${playbackId}.m3u8?token=${token}`);
} catch (error) {
    console.error('Error:', error.message);
}
