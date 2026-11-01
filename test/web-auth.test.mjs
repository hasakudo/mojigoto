import assert from "node:assert/strict";
import test from "node:test";

test("OAuthリダイレクトURIはindex.htmlではなくアプリのディレクトリを使う", async () => {
  const originalLocation = globalThis.location;
  globalThis.location = { href: "http://localhost:4173/index.html?code=temporary" };
  try {
    const { MicrosoftAuth } = await import(`../web/auth/pkce.mjs?test=${Date.now()}`);
    const auth = new MicrosoftAuth({ clientId: "00000000-0000-0000-0000-000000000000" });
    assert.equal(auth.redirectUri, "http://localhost:4173/");
  } finally {
    if (originalLocation === undefined) delete globalThis.location;
    else globalThis.location = originalLocation;
  }
});
