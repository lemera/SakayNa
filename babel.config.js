// babel.config.js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Remove the transform-remove-console plugin and use this instead
    plugins: [
      process.env.NODE_ENV === 'production' && [
        'babel-plugin-transform-remove-console',
        { exclude: ['error', 'warn'] } // Keep errors and warnings in production
      ]
    ].filter(Boolean)
  };
};