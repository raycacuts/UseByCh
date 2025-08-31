// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // If (and only if) you still use Reanimated:
    'react-native-reanimated/plugin',
  ],
};
