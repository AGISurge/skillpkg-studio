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
    configure: (jestConfig) => {
      jestConfig.moduleNameMapper = {
        ...jestConfig.moduleNameMapper,
        "^@/(.*)$": "<rootDir>/src/$1",
      };

      try {
        // Resolve only for tests: older Radix versions do not export this path.
        // Jest 27 needs a mapper for newer Radix conditional package exports.
        jestConfig.moduleNameMapper["^@radix-ui/primitive/is-development$"] = require.resolve(
          "@radix-ui/primitive/is-development",
          { paths: [path.dirname(require.resolve("radix-ui"))] },
        );
      } catch (error) {
        if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
      }

      return jestConfig;
    },
  },
};
