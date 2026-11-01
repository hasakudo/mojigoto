# VSIX作成環境の依存関係更新（2026-11-01）

## 対象と変更

GitHubのpush時にDependabotから36件の通知があり、ローカルのnpm監査では17パッケージ（高10・中7）が対象だった。通知数とnpmのパッケージ集計は同じ単位ではなく、36件すべての個別アラートを取得した記録ではない。対象パッケージはすべて開発用依存関係で、公開用VSIXにはnode_modulesを同梱していない。

- `@vscode/vsce`を3.9.2から正式版4.1.0へ更新。Node.jsの要件は22以上で、検証環境は24.22.1。
- vsce 4.1.0のminimatch指定は10系であり、修正版11.0.1以降へ通常の依存更新だけでは移行しない。`overrides`をvsce配下に限定して`^11.0.1`へ設定し、lockfileで11.0.3を確定した。
- その他は`npm audit fix`の互換範囲で更新。qsは6.17.1。`--force`は使用していない。
- 拡張の公開バージョンは未公開の2.0.0を維持。利用者向けの製品コード・画像・README・CHANGELOGは変更していない。

minimatchのメジャー更新はファイル選別の互換性に影響しうるため、VSIXの全ファイル一覧と内容を修正前と照合した。vsce本体が修正版を採用した時点で、この限定overrideを外せるか再確認する。

## 検証

- `npm audit --json`：0件。脆弱性情報の取得時点の結果であり、GitHub上の各アラートの解消確認とは区別する。
- `npm ls --all`：依存関係の不整合なし。
- `npm test`：全1,987件成功、失敗・スキップ0。
- vsce 4.1.0でVSIX作成成功。修正前と同じ433エントリ、追加・削除なし。差分は`extension/package.json`の開発用依存設定のみで、製品コード・素材・README・CHANGELOG・VSIX manifestはバイト単位で一致。
- 変換対象Markdown等を除く429ファイルがソースと一致。従来の秘密設定・認証データ・開発記録・node_modulesの除外も維持。
- 修正前VSIX、監査結果、依存ツリー、テストログ、照合結果は`.review-baseline/dependency-security-20261101/`へ保存。公開用は`release/mojigoto-2.0.0.vsix`を再作成する。

## 根拠

- [vsce 4.1.0](https://github.com/microsoft/vscode-vsce/releases/tag/v4.1.0)
- [minimatchのアドバイザリ](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- [npm auditの仕様](https://docs.npmjs.com/cli/v11/commands/npm-audit/)

Marketplaceへの手動アップロード、公開後のタグ作成は利用者の作業として残す。
