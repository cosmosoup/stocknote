import Anthropic from "@anthropic-ai/sdk";
import type { NewsItem } from "@/types";
import { getNewsTranslationCache, saveNewsTranslationCache } from "./supabase";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/** 記事タイトルをキャッシュキーとして使用（同一記事の再翻訳を避ける） */
function cacheKey(n: NewsItem): string {
  return n.title.trim().slice(0, 200);
}

/**
 * ニュースのタイトル・要約を日本語に一括翻訳する（Haikuモデルでコスト最小化）
 * 既に翻訳済みの記事はSupabaseキャッシュから復元し、新着分のみAPIを呼び出す
 * 翻訳失敗時は原文のまま返す（表示自体は継続できるようにする）
 */
export async function translateNews(news: NewsItem[]): Promise<NewsItem[]> {
  if (news.length === 0) return news;
  const cache = await getNewsTranslationCache();

  const misses: NewsItem[] = [];
  for (const n of news) {
    if (!cache[cacheKey(n)]) misses.push(n);
  }

  // 日本語ソース（NHK等）は翻訳不要
  const needsTranslation = misses.filter((n) => !n.source.startsWith("NHK"));

  if (needsTranslation.length > 0) {
    try {
      const prompt = needsTranslation
        .map((n, i) => `[${i}] TITLE: ${n.title}\nSUMMARY: ${n.summary.slice(0, 200)}`)
        .join("\n\n");

      const message = await getClient().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `以下の英語ニュース記事のタイトルと要約を自然な日本語に翻訳してください。
出力は元のインデックス番号を保持したJSON配列のみとし、説明や前置きは一切含めないこと。

出力形式:
[{"i": 0, "title_ja": "...", "summary_ja": "..."}, ...]

${prompt}`,
          },
        ],
      });
      const content = message.content[0];
      if (content.type !== "text") throw new Error("Unexpected response type from Claude API");

      const jsonText = content.text.replace(/```json\s*|```\s*/g, "").trim();
      const translated = JSON.parse(jsonText) as { i: number; title_ja: string; summary_ja: string }[];

      for (const t of translated) {
        const original = needsTranslation[t.i];
        if (!original) continue;
        cache[cacheKey(original)] = { title_ja: t.title_ja, summary_ja: t.summary_ja };
      }
      await saveNewsTranslationCache(cache);
    } catch (err) {
      console.error("News translation failed:", err);
    }
  }

  return news.map((n) => {
    const cached = cache[cacheKey(n)];
    return cached ? { ...n, title_ja: cached.title_ja, summary_ja: cached.summary_ja } : n;
  });
}
