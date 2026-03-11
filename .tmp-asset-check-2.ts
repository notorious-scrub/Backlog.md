import { BacklogServer } from "./src/server/index.ts";

const server = new BacklogServer("C:/DEV/ITSM-PLATFORM/cloud-forge");
await server.start(6514, false);
const html = await (await fetch("http://127.0.0.1:6514/")).text();
const chunkPaths = [...(html.match(/\/(?:\.\.\/)+chunk-[^\"']+/g) ?? [])].map((p) => p.replace(/^\/\.\.\/\.\.\//, '/'));
for (const p of chunkPaths) {
  const res = await fetch(`http://127.0.0.1:6514${p}`);
  console.log(p, res.status);
}
const miss = await fetch("http://127.0.0.1:6514/contentLogger.js-TDUqHSu2.js");
console.log('/contentLogger.js-TDUqHSu2.js', miss.status);
await server.stop();
