module.exports = function (api) {
    // Bust transform cache when EXPO_PUBLIC_* env changes (otherwise .env.local edits can stick on an old IP).
    api.cache.using(() =>
        [
            process.env.EXPO_PUBLIC_NEST_API_URL ?? "",
            process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
            process.env.EXPO_PUBLIC_BRIDGE_INTERNAL_SECRET ?? "",
        ].join("|"),
    );
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            'react-native-reanimated/plugin',
        ],
    };
};
