/** @type {import('prettier').Config} */
const prettierConfig = {
  tabWidth: 2,
  useTabs: false,
  pugAttributeSeparator: "none",
  tailwindConfig: "./tailwind.config.cjs",
  plugins: [
    "prettier-plugin-sql",
    "prettier-plugin-embed",
    "@prettier/plugin-pug",
    "prettier-plugin-tailwindcss",
    "prettier-plugin-organize-imports",
  ],
};

/** @type {import('prettier-plugin-embed').PrettierPluginEmbedOptions} */
const prettierPluginEmbedConfig = {
  embeddedSqlIdentifiers: ["sql"],
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
  ...prettierPluginEmbedConfig,
  ...prettierPluginSqlConfig,
};

export default config;
