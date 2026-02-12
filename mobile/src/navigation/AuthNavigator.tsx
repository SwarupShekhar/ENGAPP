import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';
import CreateProfileScreen from '../screens/auth/CreateProfileScreen';

const Stack = createNativeStackNavigator();

export default function AuthNavigator({ onLoginSuccess }: { onLoginSuccess: () => void }) {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="CreateProfile">
                {(props: any) => <CreateProfileScreen {...props} onFinish={onLoginSuccess} />}
            </Stack.Screen>
        </Stack.Navigator>
    );
}

