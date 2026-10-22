import { configDefaults, defineConfig } from "vitest/config";

// Agent worktrees under .claude/ hold their own copies of the tests; npm test, the pre-commit hook and CI run this
// checkout's only.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, ".claude/**"] },
});
