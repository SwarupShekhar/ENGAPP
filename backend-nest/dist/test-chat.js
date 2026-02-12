"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
async function testChat() {
    console.log('Connecting to chat gateway...');
    const socket = (0, socket_io_client_1.io)('http://localhost:3002', {
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
        process.exit(0);
    });
    setTimeout(() => {
        console.log('Timeout - closing socket');
        socket.close();
    }, 5000);
}
testChat();
//# sourceMappingURL=test-chat.js.map