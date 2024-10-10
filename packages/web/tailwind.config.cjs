const defaultTheme = require("tailwindcss/defaultTheme");
const colors = require("tailwindcss/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,vue}"],

  theme: {
    screens: {
      "4xs": "140px",
      "3xs": "240px",
      "2xs": "360px",
      xs: "480px",
      ...defaultTheme.screens,
    },
    extend: {
      colors: {
        neutral: colors.gray,
        ["neutral-base"]: colors.neutral,
        primary: colors.indigo,
        ["primary-base"]: colors.white,
        secondary: colors.purple,
        ["secondary-base"]: colors.white,
        warn: colors.amber,
        ["warn-base"]: colors.white,
        error: colors.red,
        ["error-base"]: colors.white,
        success: colors.green,
        ["success-base"]: colors.white,
      },
      fontFamily: {
        sans: ['"Golos Text"', ...defaultTheme.fontFamily.sans],
      },
    },
  },

  plugins: [
    function ({ addUtilities, addVariant }) {
      addUtilities({
        ".pressable:not(:disabled)": {
          "@apply active:scale-95": {},
        },
        ".pressable-sm:not(:disabled)": {
          "@apply active:scale-[0.975]": {},
        },
      });
    },
  ],
};
