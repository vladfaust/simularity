/** @type {import('prettier').Config} */
const prettierConfig = {
  tabWidth: 2,
  useTabs: false,
  plugins: ["prettier-plugin-sql"],
};

/** @type {import('prettier-plugin-sql').SqlBaseOptions} */
const prettierPluginSqlConfig = {
  language: "sqlite",
  keywordCase: "upper",
  dataTypeCase: "upper",
  functionCase: "lower",
  identifierCase: "lower",
  expressionWidth: 80,
  linesBetweenQueries: 0,
  denseOperators: false,
};

const config = {
  ...prettierConfig,
  ...prettierPluginSqlConfig,
};

export default config;
