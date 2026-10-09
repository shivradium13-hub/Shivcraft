import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Session worktrees created by the desktop app hold stale copies of the
    // source — never lint them, only the real tree.
    ".claude/**",
    // Local throwaway dev scripts (gitignored).
    "scratch_*",
  ]),
  {
    rules: {
      // Advisory (a possible extra render), not a correctness rule. This
      // codebase intentionally uses effects to hydrate state from localStorage
      // on mount and to reconcile state when props change — both valid uses of
      // effects. Keep it visible as a warning instead of failing the lint.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
