import { BacklogServer } from "./src/server/index.ts";

const server = new BacklogServer("C:/DEV/ITSM-PLATFORM/cloud-forge");
await server.start(6516, false);
const tests = [
  "/chunk-xjtnsj1r.css",
  "/ITSM-PLATFORM/cloud-forge/chunk-xjtnsj1r.css",
  "/ITSM-PLATFORM/cloud-forge/chunk-tcm94fmq.js",
  "/ITSM-PLATFORM/cloud-forge/favicon-nj6r3f8v.png",
];
for (const p of tests) {
  const res = await fetch(`http://127.0.0.1:6516${p}`);
  console.log(p, res.status);
}
await server.stop();
