const { test } = require("node:test");
const assert = require("node:assert");
const { createIdentity } = require("../lib/identity.js");

const base = { sha: "aaaa111", name: "main" };
const head = { sha: "bbbb222", name: "HEAD" };

test("the first stop establishes the identity", () => {
  const id = createIdentity();
  id.check({ base, head });
  assert.deepStrictEqual(id.current(), { base, head });
});

test("a matching later stop is accepted", () => {
  const id = createIdentity();
  id.check({ base, head });
  id.check({ base: { sha: "aaaa111", name: "whatever" }, head: { sha: "bbbb222", name: "other" } });
  assert.strictEqual(id.current().base.sha, "aaaa111");
});

test("a different sha is rejected with diff_identity_mismatch", () => {
  const id = createIdentity();
  id.check({ base, head });
  assert.throws(() => id.check({ base, head: { sha: "cccc333", name: "HEAD" } }), (err) => {
    assert.strictEqual(err.code, "diff_identity_mismatch");
    assert.match(err.message, /bbbb222/);
    assert.match(err.message, /cccc333/);
    return true;
  });
});

test("sideFor maps a ref back to its side", () => {
  const id = createIdentity();
  id.check({ base, head });
  assert.strictEqual(id.sideFor("aaaa111"), "base");
  assert.strictEqual(id.sideFor("bbbb222"), "head");
  assert.strictEqual(id.sideFor("dddd444"), null);
});

test("a WORKTREE head maps to the working side", () => {
  const id = createIdentity();
  id.check({ base, head: { sha: "WORKTREE", name: "working tree" } });
  assert.strictEqual(id.sideFor("WORKTREE"), "working");
});

test("reset allows a new tour in the same window", () => {
  const id = createIdentity();
  id.check({ base, head });
  id.reset();
  id.check({ base, head: { sha: "cccc333", name: "HEAD" } });
  assert.strictEqual(id.current().head.sha, "cccc333");
});

test("sideFor before any identity is established is null", () => {
  assert.strictEqual(createIdentity().sideFor("aaaa111"), null);
});

test("when base and head are both WORKTREE, sideFor returns working", () => {
  const id = createIdentity();
  const worktreeRef = { sha: "WORKTREE", name: "working tree" };
  id.check({ base: worktreeRef, head: worktreeRef });
  assert.strictEqual(id.sideFor("WORKTREE"), "working");
});

test("check rejects malformed shape with diff_identity_mismatch", () => {
  const id = createIdentity();
  assert.throws(
    () => id.check({ base: { sha: "aaaa111" }, head: { name: "HEAD" } }),
    (err) => {
      assert.strictEqual(err.code, "diff_identity_mismatch");
      return true;
    }
  );
});

test("current returns a copy, not a live reference", () => {
  const id = createIdentity();
  id.check({ base, head });
  const first = id.current();
  first.base.sha = "mutated";
  const second = id.current();
  assert.strictEqual(second.base.sha, "aaaa111");
});
