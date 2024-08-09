
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,vue}"],

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
