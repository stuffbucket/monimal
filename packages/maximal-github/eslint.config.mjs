import { typescript } from "@maximal/eslint-config/typescript";

export default [
  ...typescript({
    ignores: ["node_modules/**", "dist/**"],
    tsconfigRootDir: import.meta.dirname,
    level: "recommended",
    typeChecked: true,
  }),
];
