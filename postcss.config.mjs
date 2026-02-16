import tailwindPostcss from "@tailwindcss/postcss";

// Next.js postcss-loader expects string plugin names; Vite/Vitest expects plugin objects.
const plugins = process.env.VITEST ? [tailwindPostcss] : ["@tailwindcss/postcss"];

export default { plugins };
