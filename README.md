# メモ帳

iPhone Safariで使う、個人用のローカル保存PWAメモアプリです。

## ファイル構成

- `index.html`: アプリ本体の入口
- `styles.css`: iPhone優先の画面デザイン
- `app.js`: メモ、アウトライン、タグ、バックアップ、PWA更新の処理
- `manifest.json`: PWAホーム画面追加用の設定
- `service-worker.js`: オフライン表示と静的アセット更新用のService Worker
- `assets/app-icon.png`: ホーム画面用アイコン
- `AGENTS.md`: このリポジトリの開発ルール

## 保存方法

入力データはブラウザの`localStorage`に保存されます。キー名は`memocho.v1`です。
Service Workerのキャッシュ削除やアプリ更新では、メモの保存データは削除しません。

## GitHub Pagesで公開するとき

1. このリポジトリをGitHubへpushします。
2. GitHubの`Settings`から`Pages`を開きます。
3. 公開元を`Deploy from a branch`にし、対象ブランチとルートフォルダを選びます。
4. 公開URLをiPhone Safariで開き、共有メニューからホーム画面へ追加します。

## iPhoneでの確認

- ホーム画面から起動できること
- すぐメモ、左下の鉛筆ボタン、メモ詳細画面が使えること
- 通常文、見出し、チェック行、3階層アウトラインが保存されること
- 設定画面でバックアップ文字列の作成、コピー、貼付、復元ができること
- 更新アイコンでキャッシュ削除と最新版読み込みができ、メモデータが残ること
