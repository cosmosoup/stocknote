import Parser from "rss-parser";
import type { NewsItem } from "@/types";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

const RSS_FEEDS = [
  // マーケット・経済全般
  { url: "https://feeds.reuters.com/reuters/marketsNews",          source: "Reuters Markets" },
  { url: "https://feeds.reuters.com/reuters/businessNews",         source: "Reuters Business" },
  { url: "https://feeds.reuters.com/reuters/topNews",              source: "Reuters Top News" },
  // CNBC（Fed動向・経済指標に強い）
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",   source: "CNBC Finance" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html",   source: "CNBC Economy" },
  // MarketWatch（相場解説・要人発言に強い）
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/",  source: "MarketWatch" },
  // Yahoo Finance（幅広いカバレッジ）
  { url: "https://finance.yahoo.com/news/rssindex",                source: "Yahoo Finance" },
];

/** RSSからニュース最新20件を取得 */
export async function fetchNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, source }) => {
      const feed = await parser.parseURL(url);
      return feed.items.slice(0, 6).map((item) => ({
        title: item.title ?? "",
        summary: item.contentSnippet ?? item.summary ?? item.content ?? "",
        source,
        pubDate: item.pubDate ?? item.isoDate,
      }));
    })
  );

  const allNews: NewsItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allNews.push(...result.value);
    }
  }

  // 最新20件に絞る（日時でソート）
  allNews.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  return allNews.slice(0, 20);
}

/** ニュースをAIプロンプト用の文字列に変換 */
export function newsToString(news: NewsItem[]): string {
  return news
    .map(
      (n, i) =>
        `[${i + 1}] [${n.source}] ${n.title}\n${n.summary.slice(0, 200)}`
    )
    .join("\n\n");
}
