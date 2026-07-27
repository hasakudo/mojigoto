# もじごと 公開・更新マニュアル

最終確認日: 2026-07-28

この文書は、VS Code 拡張機能「もじごと」を GitHub と VS Code Marketplace へ公開・更新するための作業手順です。

公式資料:

- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [@vscode/vsce](https://github.com/microsoft/vscode-vsce)
- [Visual Studio Marketplace Publisher 管理画面](https://marketplace.visualstudio.com/manage/publishers/)

## 1. 現在の公開情報

| 項目 | 値 |
| --- | --- |
| 拡張機能ID | `hasakudo.mojigoto` |
| `publisher` | `hasakudo` |
| Publisher表示名 | 葉さく堂 |
| `name` | `mojigoto` |
| GitHub | `https://github.com/hasakudo/mojigoto` |
| 不具合報告 | `https://github.com/hasakudo/mojigoto/issues` |
| 公式サイト | `https://mojigoto.hasakudo.com` |
| ライセンス | MIT |

最初の公開後は、`publisher` と `name` を変更しないでください。この2つが Marketplace 上の拡張機能IDになります。

## 2. 公開に必要なもの

### ローカル環境

- Git
- Node.js
- `npm ci` でインストールした開発依存関係
- `@vscode/vsce`
- 最終確認用の別VS Codeプロファイル

現在の `@vscode/vsce` は Node.js 22 以上を必要とします。環境確認:

```powershell
node --version
npm --version
npx vsce --version
```

依存関係を入れ直す場合:

```powershell
npm ci
```

### GitHub

- リポジトリが公開されている
- 既定ブランチが `main`
- README用画像が `main` にpushされている
- Issuesを不具合報告先にする場合は、GitHub Issuesを有効にする

READMEのスクリーンショットはVSIXへ同梱せず、公開GitHubリポジトリから読み込む設定です。画像を変更した場合は、Marketplaceへ公開する前に必ずGitHubへpushしてください。

### Marketplace

- Microsoftアカウント
- Publisher「葉さく堂」
- Publisher ID `hasakudo`
- `package.json` の `publisher` が `hasakudo`

手動アップロードではPATは不要です。PAT、トークン、パスワード、`.env`はGitへ登録しないでください。

### リポジトリ内の必要ファイル

- `package.json`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `.vscodeignore`
- `images/icon.png`

`images/icon.png` はMarketplace用のPNG画像です。`package.json` の `icon` にSVGを指定しないでください。

## 3. Gitコミットのタイミング

### 開発中

機能追加や修正がひとまとまりになり、基本動作を確認できた時点でコミットします。大きな作業を最後まで1コミットにまとめる必要はありません。

```powershell
git status --short
git diff
git diff --check
git add -A
git diff --cached --stat
git diff --cached
git commit -m "修正内容を表すメッセージ"
```

### 公開直前

公開用バージョン、CHANGELOG、READMEが確定し、テスト用VSIXで問題が見つからなくなった段階でリリース準備コミットを作ります。

初回公開の例:

```powershell
git add -A
git commit -m "Finalize v1.0.0 release"
git push origin main
```

更新公開の例:

```powershell
git add -A
git commit -m "Prepare v1.0.1 release"
git push origin main
```

最終公開用VSIXは、原則としてこのコミットをpushした後の、変更が残っていない状態から作成します。

```powershell
git status --short
```

ここで何も表示されない状態が理想です。VSIXは`.gitignore`で除外されているため、Gitへコミットしません。

## 4. VSIXの作成と再作成

### 同梱ファイルを確認

```powershell
npm run vsix:list
```

次のものが入っていないことを確認します。

- `.git`
- `.vscode`
- `.agents`
- `node_modules`
- `.env`や認証情報
- 開発用ファイル
- README専用の大きな画像

### テスト用VSIXを作成

公開前の繰り返し確認では、分かりやすいテスト名を指定できます。

```powershell
npx vsce package --out mojigoto-1.0.0-test.vsix
```

同じコマンドをもう一度実行すると、同名のテスト用VSIXを現在の内容で再作成できます。

### 公開用VSIXを作成

```powershell
npm run vsix:package
```

`package.json` が `1.0.0` なら、通常は次のファイルが作られます。

```text
mojigoto-1.0.0.vsix
```

### VSIXをローカルインストール

VS Codeの別プロファイルで次の操作を行います。

1. 拡張機能ビューを開く
2. 右上の「…」を開く
3. 「VSIXからのインストール」を選ぶ
4. 作成したVSIXを選ぶ
5. 必要に応じてVS Codeを再読み込みする

コマンドラインで入れる場合:

```powershell
code --install-extension .\mojigoto-1.0.0.vsix --force
```

### VSIXを作り直す場合

Marketplaceへまだ公開していなければ、バージョン番号を変えずに修正して再作成できます。

1. 問題を修正する
2. 構文確認と動作確認を行う
3. テスト用VSIXを再作成する
4. 別プロファイルへ再インストールする
5. 修正をコミットしてpushする
6. 公開用VSIXを再作成する

一度Marketplaceへ公開したバージョン番号は再利用できません。公開後の修正は、`1.0.1`など新しいバージョンにします。

## 5. 公開前チェックリスト

### 表示と説明

- [ ] `package.json` の `version` が公開予定バージョン
- [ ] `publisher` が `hasakudo`
- [ ] `repository`、`bugs`、`homepage` が正しい
- [ ] `README.md` の説明と画像が最新
- [ ] `CHANGELOG.md` に公開内容がある
- [ ] `LICENSE` がMIT、著作者表示がHASAKUDO
- [ ] Marketplace用アイコンが `images/icon.png`
- [ ] View用 `images/mojigoto.svg` が表示される
- [ ] README画像がGitHubの `main` にpush済み

### 動作

- [ ] Singleモードの初回セットアップ
- [ ] Multiモードの初回セットアップと作品切替
- [ ] 作品ツリーの作成、変更、移動、削除
- [ ] 縦書きプレビューの起動と停止
- [ ] カーソル追従とスクロール連動
- [ ] ルビ、傍点、句読点処理
- [ ] 原稿書き出しの簡易／実寸
- [ ] ノート、構想メモ、執筆メモ
- [ ] UTF-8保存と既存のエンコード警告
- [ ] 書き出し先選択のキャンセル

### パッケージ

- [ ] `npm run vsix:list` で同梱内容を確認
- [ ] `npm run vsix:package` が成功
- [ ] 別プロファイルへVSIXをインストール
- [ ] インストール後の初回起動を確認
- [ ] Developer Toolsに重大なエラーがない
- [ ] Gitの作業ツリーが意図した状態

`vsce`の「JavaScriptファイルが多いのでbundleを推奨」という警告は、現時点では公開を止めるエラーではありません。起動速度や配布構成を改善する場合は、将来の更新でbundle化を検討します。

## 6. Marketplaceへ初回公開する

このプロジェクトでは、まず管理画面からの手動アップロードを標準手順にします。

1. [Publisher管理画面](https://marketplace.visualstudio.com/manage/publishers/)へMicrosoftアカウントでログインする
2. Publisher「葉さく堂（hasakudo）」を選ぶ
3. 新しいVisual Studio Code拡張機能を追加する操作を選ぶ
4. `mojigoto-1.0.0.vsix` をアップロードする
5. Marketplaceの検証結果を確認する
6. 公開処理が終わるまで待つ
7. Marketplaceページで説明、画像、ライセンス、リンク、バージョンを確認する
8. VS Codeの拡張機能検索から「もじごと」を検索し、Marketplace版をインストールして確認する

画面上のボタン名はMarketplace側の更新で変わる場合があります。「New extension」「Visual Studio Code」「Upload」などの表示を目印にします。

公開成功後、公開したコミットへタグを付けます。

```powershell
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

GitHub ReleasesにVSIXを添付する運用は任意です。VSIX自体を通常のGitコミットへ追加する必要はありません。

## 7. 更新版を公開する

### バージョンの決め方

- バグ修正だけ: `1.0.0` → `1.0.1`（patch）
- 後方互換のある機能追加: `1.0.0` → `1.1.0`（minor）
- 互換性を壊す大きな変更: `1.0.0` → `2.0.0`（major）

バージョンを明示して更新する例:

```powershell
npm version 1.0.1 --no-git-tag-version
```

このコマンドは `package.json` と `package-lock.json` のバージョンを更新します。続けて `CHANGELOG.md` に同じバージョンの変更内容を書きます。

### 更新公開の流れ

1. 修正・機能追加を行う
2. 通常の動作確認を行う
3. 新しいバージョン番号を設定する
4. `CHANGELOG.md` と必要に応じて `README.md` を更新する
5. テスト用VSIXを作成して別プロファイルで確認する
6. リリース準備コミットを作成して `main` へpushする
7. 公開用VSIXを作成して最終確認する
8. Publisher管理画面で既存の「もじごと」を選ぶ
9. 新しいバージョンのVSIXをアップロードする
10. Marketplace版のバージョンと動作を確認する
11. 公開したコミットへ `v1.0.1` などのタグを付けてpushする

更新時は、新しい拡張機能を作成するのではなく、既存の `hasakudo.mojigoto` に新しいVSIXをアップロードします。

## 8. CLI公開と自動公開

CLIから既に作成したVSIXを公開する場合は、`vsce publish --packagePath`を使用できます。

```powershell
npx vsce publish --packagePath .\mojigoto-1.0.1.vsix
```

ただし、CLI公開にはMarketplaceの認証設定が必要です。初回は手動アップロードの方が確認しやすいため、このリポジトリでは手動を標準とします。

Azure DevOpsのグローバルPATは2026年12月1日に廃止予定です。将来自動公開する場合は、PATをGitHub Secretsへ追加する方式ではなく、MarketplaceのTrusted PublishingとGitHub ActionsのOIDCを優先してください。

`vsce publish minor`など、バージョンを引数にした公開は `package.json` の更新に加えてGitコミットとタグを自動作成する場合があります。Git操作を自分で管理する間は、先にVSIXを作成し、手動アップロードまたは `--packagePath` を使う方が安全です。

## 9. 公開後に不具合が見つかった場合

公開済みVSIXを同じバージョン番号で差し替えず、修正版を新しいpatchバージョンとして公開します。

例:

```text
公開済み: 1.0.0
修正版:   1.0.1
```

緊急で公開を止める必要がある場合は、Publisher管理画面のUnpublishを検討します。Removeは統計が失われ、拡張機能名も再利用できなくなるため、通常の不具合対応では使用しません。

## 10. よくある問題

### 同じバージョンが存在すると表示される

Marketplace公開済みの番号は再利用できません。`package.json` と `package-lock.json` を次のバージョンへ進めます。

### README画像が表示されない

- 画像がGitHubの `main` にpushされているか確認する
- READMEの相対パスと実際のファイル名を確認する
- GitHubリポジトリが公開されているか確認する
- 外部URLならHTTPSになっているか確認する

### 不要なファイルがVSIXへ入る

`.vscodeignore`を更新し、再度次を実行します。

```powershell
npm run vsix:list
npm run vsix:package
```

### 公開直前のVSIXで不具合が見つかる

まだMarketplaceへ公開していなければ、同じバージョンのまま修正・コミット・push・VSIX再作成を行います。古いVSIXは使用しません。

### `publisher` が一致しない

`package.json` の `publisher` がPublisher IDの `hasakudo` と完全一致しているか確認します。表示名の「葉さく堂」ではありません。
