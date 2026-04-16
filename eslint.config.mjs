// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts"],
        rules: {
            // Allow unused vars prefixed with _ (common convention for intentional ignores)
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            // Don't require explicit return types everywhere — inference is fine
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            // Allow `any` with a warning, not an error
            "@typescript-eslint/no-explicit-any": "warn",
            // Prefer const
            "prefer-const": "error",
            // No var
            "no-var": "error",
        },
    },
    {
        // Ignore test files from strictness
        files: ["src/**/*.spec.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
    {
        ignores: ["dist/**", "node_modules/**", "src/**/*.spec.ts"],
    },
);
