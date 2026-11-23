import { describe, expect, it } from "vitest";
import { findBulkGitAdd } from "./gitAddGuard.mjs";

describe("findBulkGitAdd", () => {
  it.each([
    "git add -A",
    "git add --all",
    "git add .",
    "git add ./",
    "git add :/",
    "git add :",
    "git add '*'",
    "git add *",
    "git add :/*",
    "git add -u",
    "git add --update",
    "git add --no-ignore-removal",
    "git add -Av",
    "git add -vu",
    "git add -- .",
    "git add src/a.ts .",
  ])("blocks %j", (cmd) => {
    expect(findBulkGitAdd(cmd)).toMatch(/explicit paths/);
  });

  it.each([
    "npm test && git add -A",
    "git status; git add .",
    "false || git add --all",
    "echo hi | git add .",
    "git status\ngit add .",
    "echo $(git add .)",
    "echo `git add -A`",
    "git -C sub add .",
    "git -c core.autocrlf=false add -A",
    "git --no-pager --git-dir=.git add .",
    "GIT_TRACE=1 git add .",
    "cd /repo && git add . && git commit -m wip",
    "/usr/bin/git add -A",
    "cat <<'EOF'\nliteral\nEOF\ngit add .",
    "cat <<EOF\n$(git add -A)\nEOF",
  ])("blocks a bulk add inside %j", (cmd) => {
    expect(findBulkGitAdd(cmd)).not.toBeNull();
  });

  it.each([
    "git add src/a.ts docs/x.md",
    "git add -p src/a.ts",
    "git add -N src/new.ts",
    "git add -- src/a.ts",
    "git add './src/a b.ts'",
    "git add .gitignore",
    "git add .claude/settings.json",
    "git status",
    "git commit -m 'git add .'",
    'echo "git add -A"',
    "npm run add -- .",
    "git stash -u",
    "git log --all",
    "gh pr create --body \"$(cat <<'EOF'\nRun `git add -A` never.\ngit add .\nEOF\n)\"",
    "cat <<EOF > notes.md\ngit add .\nEOF",
    "cat <<-'X'\n\tgit add -A\n\tX\necho done",
    "",
  ])("allows %j", (cmd) => {
    expect(findBulkGitAdd(cmd)).toBeNull();
  });
});
