const { createRequire } = require("module");

// Use the same config and plugins as CRA, including with pnpm's dependency layout.
const craRequire = createRequire(require.resolve("react-scripts/package.json"));

module.exports = {
  extends: [
    craRequire.resolve("eslint-config-react-app"),
    craRequire.resolve("eslint-config-react-app/jest"),
  ],
};
