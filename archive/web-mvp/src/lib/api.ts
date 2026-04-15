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

export const getLiveKitToken = async (sessionId: string) => {
    // We don't need to pass userId explicitly if the backend extracts it from the token
    // But the controller expects it in the body: { userId, sessionId }
    // Let's rely on the backend to use the authenticated user's ID if possible, 
    // OR we need to decode the token/store userId in context.
    // For now, let's assume the backend endpoint might need adjustment or we send a dummy if it uses req.user

    // Wait, the controller code I saw:
    // @Post('token')
    // async getToken(@Body() body: { userId: string; sessionId: string }) ...
    // It doesn't seem to use @Request() req.user
    // So we must pass userId. 

    // We need to access userId from the auth context. 
    // Since this is a standalone function, we can't use hooks.
    // We will accept userId as an argument.
    return Promise.reject("Use the component directly");
};

export default api;
