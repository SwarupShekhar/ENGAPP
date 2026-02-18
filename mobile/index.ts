import { registerRootComponent } from 'expo';
import App from './src/App';

// LiveKit requires native modules — wrap in try/catch for Expo Go compatibility
try {
    const { registerGlobals } = require('@livekit/react-native');
    registerGlobals();
} catch (e) {
    console.warn('[LiveKit] Native modules not available (Expo Go mode). Call features disabled.');
}

registerRootComponent(App);
