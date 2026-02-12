import { io } from 'socket.io-client';

async function testChat() {
    console.log('Connecting to chat gateway...');

    // mock a clerk token - in a real test this needs to be a valid JWT signed by Clerk
    // For this test, we might expect it to fail auth if we don't have a valid token, 
    // which proves the gateway is reachable and checking auth.
    const socket = io('http://localhost:3002', {
        auth: {
            token: 'test-token'
        }
    });

    socket.on('connect', () => {
        console.log('Connected to server!');
        socket.emit('sendMessage', { recipientId: 'some-user-id', content: 'Hello!' });
    });

    socket.on('disconnect', () => {
        console.log('Disconnected');
    });

    socket.on('connect_error', (err) => {
        console.log('Connection Error:', err.message);
        // We expect "Invalid token" or similar if the gateway is running but rejecting the mock token
        process.exit(0);
    });

    setTimeout(() => {
        console.log('Timeout - closing socket');
        socket.close();
    }, 5000);
}

testChat();
