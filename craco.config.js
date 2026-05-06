const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      webpackConfig.ignoreWarnings = [
        ...(webpackConfig.ignoreWarnings || []),
        (warning) =>
          warning.module?.resource?.includes("node_modules/@griffel/") &&
          warning.message?.includes("Failed to parse source map"),
      ];

      return webpackConfig;
    },
  },
  jest: {
    configure: {
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
      },
    },
  },
};
