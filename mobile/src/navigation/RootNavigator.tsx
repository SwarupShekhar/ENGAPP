import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import AssessmentScreen from "../screens/AssessmentScreen";
import ProgressScreen from "../screens/ProgressScreen";
import ProfileScreen from "../screens/ProfileScreen";
import FeedbackScreen from "../screens/FeedbackScreen";
import CallScreen from "../screens/CallScreen";
import InCallScreen from "../screens/InCallScreen";
import CallFeedbackScreen from "../screens/CallFeedbackScreen";
import CreateProfileScreen from "../screens/auth/CreateProfileScreen";
import AssessmentIntroScreen from "../screens/assessment/AssessmentIntroScreen";
import AssessmentSpeakingScreen from "../screens/assessment/AssessmentSpeakingScreen";
import AssessmentResultScreen from "../screens/assessment/AssessmentResultScreen";
import CustomTabBar from "../components/navigation/CustomTabBar";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
    return (
        <Tab.Navigator
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{ headerShown: false }}
        >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Feedback" component={FeedbackScreen} />
            <Tab.Screen name="Call" component={CallScreen} />
            <Tab.Screen name="Progress" component={ProgressScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}

interface RootNavigatorProps {
    initialRoute: string;
}

export default function RootNavigator({ initialRoute }: RootNavigatorProps) {
    return (
        <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{ headerShown: false }}
        >
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />

            {/* Assessment Flow */}
            <Stack.Screen name="AssessmentIntro" component={AssessmentIntroScreen} />
            <Stack.Screen name="AssessmentSpeaking" component={AssessmentSpeakingScreen} />
            <Stack.Screen name="AssessmentResult" component={AssessmentResultScreen} />

            {/* Call Flow */}
            <Stack.Screen name="InCall" component={InCallScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="CallFeedback" component={CallFeedbackScreen} />
        </Stack.Navigator>
    );
}
