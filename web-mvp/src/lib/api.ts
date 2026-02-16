import axios from 'axios';

// Create an Axios instance
const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 10000, // 10 seconds timeout
});

// Add a request interceptor to include the auth token
api.interceptors.request.use(
    (config) => {
        // In a real app, retrieve token from local storage or context
        // For MVP, we might hardcode or use a simple input on login page
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

export default api;
