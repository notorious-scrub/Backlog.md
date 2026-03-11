import { BacklogServer } from "./src/server/index.ts";

const server = new BacklogServer("C:/DEV/ITSM-PLATFORM/cloud-forge");
await server.start(6513, false);
const response = await fetch("http://127.0.0.1:6513/");
const html = await response.text();
const matches = html.match(/(?:href|src)=\"([^\"]*chunk-[^\"]+)\"/g) ?? [];
console.log('chunk refs raw:', matches);
const chunkPaths = [...(html.match(/\/(?:\.\.\/)+chunk-[^\"']+/g) ?? [])].map((p) => p.replace(/^\/\.\.\/\.\.\//, '/'));
for (const p of chunkPaths) {
  const res = await fetch(`http://127.0.0.1:6513${p}`);
  console.log(p, res.status);
}
const contentLogger = '/contentLogger.js-TDUqHSu2.js';
const contentLoggerRes = await fetch(`http://127.0.0.1:6513${contentLogger}`);
console.log(contentLogger, contentLoggerRes.status);
await server.stop();
