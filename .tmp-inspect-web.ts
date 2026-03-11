import { BacklogServer } from "./src/server/index.ts";

const server = new BacklogServer("C:/DEV/ITSM-PLATFORM/cloud-forge");
await server.start(6512, false);
const response = await fetch("http://127.0.0.1:6512/");
const html = await response.text();
console.log(html.slice(0, 1200));
console.log("chunk refs:", html.match(/chunk-[^\"']+/g) ?? []);
const chunkMatches = html.match(/(\/[^\"']*chunk-[^\"']*)/g) ?? [];
for (const path of chunkMatches) {
  const res = await fetch(`http://127.0.0.1:6512${path}`);
  console.log(path, res.status);
}
await server.stop();
