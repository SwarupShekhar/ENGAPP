const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle .onnx models (Silero VAD) as binary assets so onnxruntime-react-native can load them.
if (!config.resolver.assetExts.includes('onnx')) {
  config.resolver.assetExts = [...config.resolver.assetExts, 'onnx'];
}

module.exports = config;
