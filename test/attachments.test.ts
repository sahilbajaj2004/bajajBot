import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expandAttachments, extractAttachments, buildVisionContent } from "../src/util/attachments.js";

const root = mkdtempSync(join(tmpdir(), "bajajbot-attach-"));
writeFileSync(join(root, "app.ts"), "export const main = () => 0;\n");
writeFileSync(join(root, "notes.md"), "# Notes\n");
writeFileSync(join(root, "big.txt"), `${"x".repeat(70_000)}\n`);

test("extractAttachments keeps only tokens that resolve to existing files", () => {
  const found = extractAttachments("check @app.ts and @missing.ts plus @notes.md.", root);
  assert.deepEqual(found, { texts: ["app.ts", "notes.md"], images: [] });
});

test("extractAttachments dedupes and ignores emails", () => {
  assert.deepEqual(extractAttachments("@app.ts @app.ts mail me @user@host.com", root), {
    texts: ["app.ts"],
    images: [],
  });
  assert.deepEqual(extractAttachments("no mentions here", root), { texts: [], images: [] });
});

test("expandAttachments appends fenced blocks and keeps original text first", () => {
  const expanded = expandAttachments("review this @app.ts please", ["app.ts"], root);
  assert.match(expanded, /^review this @app\.ts please\n/);
  assert.match(expanded, /@app\.ts:\n```ts\nexport const main = \(\) => 0;\n```/);
});

test("expandAttachments truncates oversized files and reports missing ones", () => {
  const big = expandAttachments("summarize @big.txt", ["big.txt"], root);
  assert.match(big, /… truncated \(7000\d chars total\)/);

  const missing = expandAttachments("what is @gone.ts?", ["gone.ts"], root);
  assert.match(missing, /@gone\.ts \(could not attach: ENOENT/);
});

test("expandAttachments passes through messages without attachments", () => {
  assert.equal(expandAttachments("plain text", undefined, root), "plain text");
  assert.equal(expandAttachments("plain text", [], root), "plain text");
});

test("round trip: extracted paths expand into one payload", () => {
  const text = "diff @app.ts vs @notes.md";
  const { texts } = extractAttachments(text, root);
  const payload = expandAttachments(text, texts, root);
  for (const token of texts) assert.ok(payload.includes(`@${token}:`));
});

test("images are separated from text attachments and encoded as data URLs", () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  writeFileSync(join(root, "shot.png"), png);
  writeFileSync(join(root, "pic.JPG"), Buffer.from("ffd8ffe0", "hex"));

  const found = extractAttachments("look at @shot.png and @pic.JPG plus @app.ts", root);
  assert.deepEqual(found.images, ["shot.png", "pic.JPG"]);
  assert.deepEqual(found.texts, ["app.ts"]);

  const parts = buildVisionContent(
    { role: "user", content: "look at @shot.png", timestamp: "", images: found.images },
    root,
  );
  assert.ok(Array.isArray(parts));
  assert.equal(parts[0].type, "text");
  assert.match(parts[0].text ?? "", /^look at @shot\.png/);
  assert.equal(parts.length, 3);
  assert.equal(parts[1].type, "image_url");
  assert.match((parts[1].image_url?.url ?? "").slice(0, 40), /^data:image\/png;base64,/);
  assert.equal(parts[2].type, "image_url");
  assert.match((parts[2].image_url?.url ?? "").slice(0, 42), /^data:image\/jpeg;base64,/);

  const textOnly = buildVisionContent({ role: "user", content: "hi", timestamp: "" }, root);
  assert.equal(textOnly, "hi");
});

test("missing images become notes instead of parts", () => {
  const parts = buildVisionContent(
    { role: "user", content: "see @gone.png", timestamp: "", images: ["gone.png"] },
    root,
  );
  assert.ok(Array.isArray(parts));
  assert.equal(parts.filter((part) => part.type === "image_url").length, 0);
  assert.match(parts[0].text ?? "", /could not attach image: ENOENT/);
});
