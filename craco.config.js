const path = require("path");

module.exports = {
  style: {
    postcss: {
      mode: "file",
    },
  },
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      for (const minimizer of webpackConfig.optimization?.minimizer || []) {
        if (minimizer?.constructor?.name !== "CssMinimizerPlugin") continue;

        minimizer.options.minimizer.options = {
          ...(minimizer.options.minimizer.options || {}),
          preset: ["default", { calc: false }],
        };
      }

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
