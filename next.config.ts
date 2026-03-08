import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel Cron Jobsのタイムアウトを延長（Claude APIが最大90秒かかる）
  // api/report はVercel Pro以上でmaxDurationを設定可能
};

export default nextConfig;
