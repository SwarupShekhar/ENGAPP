import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Clipboard } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import SocketService from '../services/socketService';

export default function SocketDebugScreen() {
    const { user } = useUser();
    const { getToken } = useAuth();
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState('Checking...');
    const [socketId, setSocketId] = useState<string | null>(null);

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    };

    const checkConnection = async () => {
        const service = SocketService.getInstance();
        const isConnected = service.isConnected();
        setStatus(isConnected ? 'Connected' : 'Disconnected');
        setSocketId(service.getSocketId() || 'None');
        addLog(`Connection Status: ${isConnected ? 'Connected' : 'Disconnected'}`);
        addLog(`Socket ID: ${service.getSocketId() || 'None'}`);
        addLog(`User ID: ${user?.id}`);
    };

    useEffect(() => {
        checkConnection();
        const interval = setInterval(checkConnection, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleReconnect = async () => {
        addLog('Attempting manual reconnect...');
        const service = SocketService.getInstance();
        service.disconnect();
        const token = await getToken();
        if (token) {
            service.connect(token);
            addLog('Connect called with new token');
        } else {
            addLog('Failed to get token');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Socket Debugger</Text>
            
            <View style={styles.infoBox}>
                <Text style={styles.label}>Status: <Text style={{fontWeight: 'bold', color: status === 'Connected' ? 'green' : 'red'}}>{status}</Text></Text>
                <Text style={styles.label}>Socket ID: {socketId}</Text>
                <Text style={styles.label}>User ID: {user?.id}</Text>
            </View>

            <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.button} onPress={checkConnection}>
                    <Text style={styles.buttonText}>Refresh Status</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, {backgroundColor: '#EF4444'}]} onPress={handleReconnect}>
                    <Text style={styles.buttonText}>Force Reconnect</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.logContainer}>
                {logs.map((log, i) => (
                    <Text key={i} style={styles.logText}>{log}</Text>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#0F172A' },
    title: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 20 },
    infoBox: { padding: 15, backgroundColor: '#1E293B', borderRadius: 10, marginBottom: 20 },
    label: { color: 'white', marginBottom: 5, fontSize: 14 },
    buttonRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    button: { padding: 10, backgroundColor: '#3B82F6', borderRadius: 8, flex: 1, alignItems: 'center' },
    buttonText: { color: 'white', fontWeight: 'bold' },
    logContainer: { flex: 1, backgroundColor: '#000', borderRadius: 10, padding: 10 },
    logText: { color: '#00FF00', fontFamily: 'monospace', fontSize: 12, marginBottom: 4 }
});
