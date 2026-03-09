import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkStrapi() {
  const baseUrl = process.env.STRAPI_BASE_URL;
  const token = process.env.STRAPI_API_KEY;
  console.log('Base URL:', baseUrl);
  console.log('Token Length:', token?.length);

  try {
    const url = `${baseUrl}/api/reels?populate=*&pagination[limit]=5`;
    console.log('Fetching:', url);
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('Response Status:', response.status);
    console.log('Data Length:', response.data?.data?.length);
    if (response.data?.data?.length > 0) {
      console.log('First reel ID:', response.data.data[0].id);
    } else {
      console.log(
        'Full Response Body:',
        JSON.stringify(response.data).slice(0, 500),
      );
    }
  } catch (e) {
    console.error('Strapi Check Failed:', e.message);
    if (e.response) {
      console.log('Error Data:', e.response.data);
    }
  }
}

checkStrapi();
