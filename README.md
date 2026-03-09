# StockNote 📈

AIが毎日・毎月の投資ポートフォリオレポートを自動生成するパーソナルダッシュボードです。

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8)

## 特徴

- **日次レポート自動生成** — 毎朝 Claude AI が保有銘柄・相場状況を分析してレポートを作成
- **月次レポート自動生成** — 月初に前月のパフォーマンスをまとめたレポートを自動作成
- **マルチ通貨対応** — 米国株（USD）・日本株（JPY）を混在して管理可能
- **相場センチメント** — CNN Fear & Greed Index・為替レートをリアルタイム取得
- **Google Sheets 連携**（任意） — 日次データをスプレッドシートに自動記録
- **メール通知** — レポート生成時に Gmail でメール送信
- **ダークテーマ UI** — レスポンシブ対応のダッシュボード

## スクリーンショット

> （準備中）

## 技術スタック

| カテゴリ | 使用技術 |
|----------|----------|
| フロントエンド | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 |
| データベース | Supabase (PostgreSQL) |
| AI | Claude claude-opus-4-6 (Anthropic) |
| メール送信 | Gmail SMTP (nodemailer) |
| 株価データ | Yahoo Finance v8 API（非公式） |
| 相場指数 | CNN Fear & Greed Index API |
| 為替レート | ExchangeRate API |
| チャート | QuickChart.io |
| デプロイ | Vercel |

## セットアップ

### 必要なもの

- Node.js 18+
- [Supabase](https://supabase.com) アカウント（無料枠で動作）
- [Anthropic API](https://console.anthropic.com) キー
- Gmail アカウント（アプリパスワード発行済み）
- [Vercel](https://vercel.com) アカウント（デプロイ用）

### 1. リポジトリのクローン

```bash
git clone https://github.com/cosmosoup/stocknote.git
cd stocknote
npm install
```

### 2. Supabase のセットアップ

1. [Supabase](https://supabase.com) でプロジェクトを作成
2. SQL Editor を開き、`supabase/schema.sql` の内容を貼り付けて実行
3. `portfolio` テーブルに保有銘柄を INSERT する

```sql
-- 例: 米国株
INSERT INTO portfolio (ticker, shares, cost_price, cost_rate)
VALUES ('VT', 10, 120.00, 148.50);

-- 例: 日本株（cost_rate は null）
INSERT INTO portfolio (ticker, shares, cost_price, cost_rate)
VALUES ('6758', 100, 13000, null);
```

> **日本株のティッカー**: 4桁の証券コードをそのまま入力してください（`.T` は不要）

### 3. Gmail アプリパスワードの取得

1. Google アカウント → セキュリティ → 2段階認証を有効化
2. 「アプリパスワード」を発行（16文字のパスワード）

### 4. 環境変数の設定

```bash
cp .env.local.example .env.local
```

`.env.local` を編集して各値を設定：

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxx

GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
NOTIFY_EMAIL=your@email.com

CRON_SECRET=your-random-secret-string-here

AUTH_PASSWORD=your-login-password
AUTH_SECRET=your-64-char-hex-string  # openssl rand -hex 32 で生成
```

> `AUTH_SECRET` の生成: `openssl rand -hex 32` をターミナルで実行

### 5. ローカル動作確認

```bash
npm run dev:force
```

`http://localhost:3000` を開いてダッシュボードを確認。

レポートの手動生成テスト:

```bash
curl -X POST http://localhost:3000/api/report
```

### 6. Vercel へのデプロイ

1. GitHub にリポジトリを push
2. [Vercel](https://vercel.com) で「Add New Project」→ リポジトリを選択
3. 環境変数を設定（`.env.local` と同じ内容）
4. デプロイ完了後、`vercel.json` の Cron Job が自動で有効化される

## Cron スケジュール

| ジョブ | スケジュール | JST 換算 |
|--------|-------------|----------|
| 日次レポート | 毎日 22:00 UTC | 翌日 07:00 |
| 月次レポート | 毎月1日 23:00 UTC | 2日 08:00 |

> Vercel Cron は Hobby プランでも利用可能ですが、実行間隔に制限があります。

## Google Sheets 連携（任意）

日次データをスプレッドシートに自動記録できます。

1. Google Cloud Console でサービスアカウントを作成
2. スプレッドシートにサービスアカウントのメールアドレスを編集者として共有
3. `.env.local` に `GOOGLE_*` 変数を設定

## ライセンス

MIT

## 注意事項

- Yahoo Finance v8 API は非公式APIです。予告なく仕様変更・停止される場合があります
- このツールは個人利用を目的として作成されています
- 投資判断はご自身の責任で行ってください
