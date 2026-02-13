import axios from 'axios';
import { useAuth } from '@clerk/clerk-expo';

// Access localhost from emulator/device or use production URL
const IS_PROD = !__DEV__;
const API_URL = IS_PROD
    ? 'https://engapp-3210.onrender.com'
    : 'http://10.0.2.2:3000'; // Local dev (Android Emulator)

export const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

let getToken: (() => Promise<string | null>) | null = null;

export const setAuthTokenFetcher = (fetcher: () => Promise<string | null>) => {
    getToken = fetcher;
};

client.interceptors.request.use(
    async (config) => {
        if (getToken) {
            const token = await getToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);
