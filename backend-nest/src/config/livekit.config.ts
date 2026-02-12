import { registerAs } from '@nestjs/config';

export default registerAs('livekit', () => ({
    url: process.env.LIVEKIT_URL,
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
}));
