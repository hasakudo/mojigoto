import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { appendCognitoIdentityDetails, renderRemovedCognitoUsers } from "../web/lib/admin-cognito-identity.mjs";

test("verified Cognito identities survive login, removal and privacy projection until retention expiry", () => {
  const root = fileURLToPath(new URL("../.review-baseline/test-temp/", import.meta.url));
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "cognito-identities-"));
  try {
    const php = process.env.PHP_BIN || (fs.existsSync("C:/xampp/php/php.exe") ? "C:/xampp/php/php.exe" : "php");
    const result = spawnSync(php, [fileURLToPath(new URL("./fixtures/admin-cognito-identity.php", import.meta.url)), directory], { encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.textContent = ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  set innerHTML(_) { throw new Error("HTML injection is forbidden"); }
}
const documentRef = { createElement: (tag) => new Element(tag) };
const nodes = (element) => [element, ...element.children.flatMap(nodes)];
const identity = { issuer: "https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_Test", sub: "11111111-2222-3333-4444-555555555555", provider: "google" };

test("copy sends the exact Cognito subject, never the app ID or a masked email", async () => {
  const card = new Element("article"), copied = [], notices = [];
  appendCognitoIdentityDetails(card, { id: "U-TEST", email: "me***@e***.com", cognitoIdentities: [identity] }, {
    documentRef, clipboard: { writeText: async (value) => copied.push(value) }, onNotice: (...args) => notices.push(args),
  });
  const button = nodes(card).find((node) => node.tag === "button");
  await button.listeners.click();
  assert.deepEqual(copied, [identity.sub]);
  assert.equal(button.disabled, false);
  assert.equal(notices.length, 1);
  assert.ok(nodes(card).some((node) => node.textContent.includes(identity.issuer)));
});

test("clipboard failure leaves selectable identifier and reports the error", async () => {
  const card = new Element("article"), notices = [];
  appendCognitoIdentityDetails(card, { cognitoIdentities: [identity] }, {
    documentRef, clipboard: { writeText: async () => { throw new Error("denied"); } }, onNotice: (...args) => notices.push(args),
  });
  const button = nodes(card).find((node) => node.tag === "button");
  await button.listeners.click();
  assert.equal(notices[0][1], true);
  assert.equal(button.disabled, false);
  assert.ok(nodes(card).some((node) => node.tag === "code" && node.textContent === identity.sub));
});

test("removed list retains copy controls and expiry but no account mutation buttons", () => {
  const list = new Element("div"), count = new Element("span");
  renderRemovedCognitoUsers(list, count, [{ id: "U-TEST", email: "me***@e***.com", removedAt: "2026-11-01T00:00:00Z", retentionExpiresAt: "2027-01-30T00:00:00Z", cognitoIdentities: [identity] }], { documentRef });
  assert.equal(count.textContent, "1件");
  assert.deepEqual(nodes(list).filter((node) => node.tag === "button").map((node) => node.textContent), ["subをコピー"]);
  assert.ok(nodes(list).some((node) => node.textContent.includes("保存期限")));
  renderRemovedCognitoUsers(list, count, [], { documentRef });
  assert.equal(count.textContent, "0件");
  assert.equal(nodes(list).filter((node) => node.tag === "button").length, 0);
});

test("unrecorded legacy users never acquire an invented identifier", () => {
  const card = new Element("article");
  appendCognitoIdentityDetails(card, { id: "U-TEST" }, { documentRef });
  assert.equal(nodes(card).filter((node) => node.tag === "button").length, 0);
  assert.ok(nodes(card).some((node) => node.textContent.includes("未記録")));
});
