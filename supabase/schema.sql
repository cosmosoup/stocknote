-- Portfolio Daily Report — Supabase Schema
-- Supabase Dashboard の SQL Editor で実行してください

-- ポートフォリオ（保有銘柄データ）
CREATE TABLE IF NOT EXISTS portfolio (
  id         SERIAL PRIMARY KEY,
  ticker     TEXT NOT NULL,           -- 'VT', '6758', 'GC=F' etc.
  shares     NUMERIC NOT NULL,        -- 保有口数
  cost_price NUMERIC NOT NULL,        -- 取得単価（現地通貨）
  cost_rate  NUMERIC DEFAULT NULL,    -- 取得時USD/JPYレート（US株のみ、日本株はNULL）
  hypothesis TEXT DEFAULT ''          -- 投資仮説（任意）
);

-- ★ 既存テーブルに hypothesis 列を追加する場合（初回セットアップ済みの場合のみ実行）:
-- ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS hypothesis TEXT DEFAULT '';

-- 日次ログ（Report_Log相当）
CREATE TABLE IF NOT EXISTS report_log (
  id           SERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  daily_pct    NUMERIC,               -- 前日比%
  total_pct    NUMERIC,               -- 通算損益%
  total_jpy    NUMERIC,               -- 評価額（万円）
  market_data  JSONB,                 -- 市場スナップショット全体（JSON）
  report_html  TEXT                   -- 生成HTML全文
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_report_log_created_at ON report_log (created_at DESC);

-- 月次レポートログ
CREATE TABLE IF NOT EXISTS monthly_report_log (
  id           SERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  month        TEXT NOT NULL,        -- '2026-02' 形式（YYYY-MM）
  total_pct    NUMERIC,              -- 月末時点の通算損益%
  total_jpy    NUMERIC,              -- 月末時点の評価額（万円）
  monthly_pct  NUMERIC,              -- 当月騰落率%（期間初→期間末）
  report_html  TEXT                  -- 生成HTML全文
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_report_log_month ON monthly_report_log (month);
CREATE INDEX IF NOT EXISTS idx_monthly_report_log_created_at ON monthly_report_log (created_at DESC);

-- ★ 同日upsert用マイグレーション（既存DBに対して実行してください）:
-- 1. 同日重複がある場合は最新1件を残してから一意制約を追加
--
-- DELETE FROM report_log
-- WHERE id NOT IN (
--   SELECT DISTINCT ON (created_at::DATE AT TIME ZONE 'Asia/Tokyo') id
--   FROM report_log
--   ORDER BY (created_at::DATE AT TIME ZONE 'Asia/Tokyo'), created_at DESC
-- );
--
-- 2. report_date 列を追加してUNIQUE制約を付与
-- ALTER TABLE report_log ADD COLUMN IF NOT EXISTS report_date DATE;
-- UPDATE report_log SET report_date = (created_at AT TIME ZONE 'Asia/Tokyo')::DATE WHERE report_date IS NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_report_log_report_date ON report_log (report_date);

-- ポートフォリオ初期データ（必要に応じて編集してください）
-- INSERT INTO portfolio (ticker, shares, cost_price, cost_rate) VALUES
--   ('VT',   100, 144.00, 150.00),
--   ('VXUS',  50, 58.00,  150.00),
--   ('7011',  20, 2500.0, NULL),
--   ('VALE',  80, 10.00,  150.00),
--   ('7832',  10, 3000.0, NULL),
--   ('PBR',  100, 12.00,  150.00),
--   ('6758',  10, 11000.0, NULL),
--   ('EPI',   30, 28.00,  150.00),
--   ('EWG',   25, 32.00,  150.00),
--   ('SQM',   15, 45.00,  150.00),
--   ('VRTX',   5, 400.00, 150.00),
--   ('V',      8, 250.00, 150.00),
--   ('BCH',   50, 18.00,  150.00),
--   ('GOOG',   3, 170.00, 150.00),
--   ('NVDA',   1, 900.00, 150.00);
