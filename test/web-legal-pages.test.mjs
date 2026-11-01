import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readWebFile = (name) => readFile(new URL(`../web/${name}`, import.meta.url), "utf8");

test("ログイン画面とアプリからサービス説明・利用規約・プライバシーポリシーを確認できる", async () => {
  const [home, about, terms, privacy, css, serviceWorker] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("about/index.html"),
    readWebFile("terms/index.html"),
    readWebFile("privacy/index.html"),
    readWebFile("legal.css"),
    readWebFile("sw.js"),
  ]);
  assert.match(home, /class="login-legal-note"/);
  assert.match(home, /<title>もじごと Web<\/title>/);
  assert.match(home, /公式HOW TO/);
  assert.match(home, /href="\.\/about\/"/);
  assert.match(home, /href="\.\/apply\/">利用申込/);
  assert.match(home, /href="\.\/terms\/"/);
  assert.match(home, /href="\.\/privacy\/"/);
  assert.match(terms, /もじごと Web 利用規約/);
  assert.match(terms, /クローズドベータ/);
  assert.match(terms, /作品データのバックアップ/);
  assert.match(privacy, /プライバシーポリシー/);
  assert.match(privacy, /作品データの取扱い/);
  assert.match(privacy, /Amazon Web Services \/ Cognito/);
  assert.match(privacy, /開示・訂正・利用停止・削除等/);
  assert.match(privacy, /Googleユーザーデータの限定的利用/);
  assert.match(privacy, /Google API Services User Data Policy/);
  assert.match(privacy, /<code>drive\.file<\/code>/);
  assert.match(privacy, /親フォルダの選択だけでは配下の項目を許可できません/);
  assert.match(privacy, /新しく作成した項目や削除して作り直した項目には追加許可が必要/);
  assert.match(privacy, /一般化されたAI・機械学習モデルの学習に使用しません/);
  assert.match(about, /Google Driveへのアクセスについて/);
  assert.match(about, /現在は招待制のクローズドベータとして提供/);
  assert.match(about, /https:\/\/mojigoto\.com\//);
  assert.match(about, /運営サーバーへ送信・保存されません/);
  assert.match(about, /<code>drive\.file<\/code>/);
  assert.match(about, /親フォルダの選択だけでは中身の許可になりません/);
  assert.match(about, /href="\.\.\/privacy\/"/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(serviceWorker, /"\.\/terms\/"/);
  assert.match(serviceWorker, /"\.\/privacy\/"/);
  assert.match(serviceWorker, /"\.\/about\/"/);
});

test("公開法務ページに内部向け草案注記を残さない", async () => {
  const [terms, privacy] = await Promise.all([
    readWebFile("terms/index.html"),
    readWebFile("privacy/index.html"),
  ]);
  assert.doesNotMatch(terms, /公開前の確認事項|草案/);
  assert.match(terms, /本人確認を行ったうえで遅滞なく回答/);
  assert.doesNotMatch(terms, /【氏名または名称】|【住所】|地方裁判所名/);
  assert.match(privacy, /利用終了後90日間/);
  assert.match(privacy, /問い合わせ対応の完了から90日間/);
  assert.match(privacy, /Cloudflare Turnstile/);
  assert.match(privacy, /href="\.\.\/contact\/"/);
  assert.match(privacy, /本人確認を行ったうえで遅滞なく回答/);
  assert.match(privacy, /第三者の広告配信サービス等を導入する場合/);
  assert.match(privacy, /12か月間/);
  assert.doesNotMatch(privacy, /公開前の確認事項|草案/);
  assert.doesNotMatch(privacy, /【氏名または名称】|【住所】|代表者氏名/);
});
