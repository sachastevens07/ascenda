// Adds the Google sign-in plugin only once its iOS client ID is filled in (app.json, extra.google),
// so builds keep working before Google Cloud is set up. Everything else stays in app.json.
module.exports = ({ config }) => {
  const iosClientId = config.extra?.google?.iosClientId ?? '';
  if (!iosClientId) return config;
  const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ['@react-native-google-signin/google-signin', { iosUrlScheme }]],
  };
};
