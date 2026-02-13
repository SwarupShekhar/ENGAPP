
const axios = require('axios');

const API_URL = 'http://localhost:3000';
const TOKEN = 'Bearer TEST_TOKEN_user_a';

async function reproduce() {
    try {
        console.log('--- Starting Assessment ---');
        const startRes = await axios.post(`${API_URL}/assessment/start`, {}, {
            headers: { Authorization: TOKEN }
        });
        const assessmentId = startRes.data.id;
        console.log('Assessment Started, ID:', assessmentId);

        console.log('\n--- Submitting Phase 1 ---');
        // Using a minimal valid base64 audio (1 sec of silence or similar)
        const audioBase64 = 'UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

        try {
            const submitRes = await axios.post(`${API_URL}/assessment/submit`, {
                assessmentId,
                phase: 'PHASE_1',
                audioBase64
            }, {
                headers: { Authorization: TOKEN }
            });
            console.log('Submit Success:', submitRes.data);
        } catch (e) {
            console.error('Submit Failed!');
            if (e.response) {
                console.error('Status:', e.response.status);
                console.error('Data:', JSON.stringify(e.response.data, null, 2));
            } else {
                console.error('Error:', e.message);
            }
        }

    } catch (e) {
        if (e.response) {
            console.error('Start Failed! Status:', e.response.status);
            console.error('Data:', JSON.stringify(e.response.data, null, 2));
        } else {
            console.error('Error:', e.message);
        }
    }
}

reproduce();
