import axios from 'axios';
import { useAuth } from '@clerk/clerk-expo';

// Access localhost from emulator/device
// Android Emulator: 10.0.2.2
// iOS Simulator: localhost
// Physical Device: Your Machine's LAN IP
const API_URL = 'http://10.0.2.2:3000'; // Change to your LAN IP if using a physical device.

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
