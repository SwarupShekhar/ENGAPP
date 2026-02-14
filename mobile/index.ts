import { registerRootComponent } from 'expo';
import { registerGlobals } from '@livekit/react-native';
import App from './src/App';

registerGlobals();
registerRootComponent(App);
