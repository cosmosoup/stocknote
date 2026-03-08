// Dev server starter — .env.local を読み込んでから next dev を起動
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// .env.local を手動でパースして process.env に設定（空文字の既存変数も上書き）
try {
  const envPath = path.join(__dirname, ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key && val) process.env[key] = val;
  }
  console.log("✓ .env.local loaded");
} catch (e) {
  console.warn("⚠ Could not read .env.local:", e.message);
}

// next dev を起動（Windowsでは shell:true が必要）
const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
  cwd: __dirname,
});
child.on("exit", (code) => process.exit(code ?? 0));
