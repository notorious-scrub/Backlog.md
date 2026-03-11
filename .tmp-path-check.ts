import { BacklogServer } from "./src/server/index.ts";

const server = new BacklogServer("C:/DEV/ITSM-PLATFORM/cloud-forge");
await server.start(6515, false);
const urls = ["http://127.0.0.1:6515/", "http://127.0.0.1:6515/ITSM-PLATFORM/cloud-forge/"];
for (const u of urls) {
  const res = await fetch(u);
  const text = await res.text();
  console.log('URL', u, 'status', res.status, 'ctype', res.headers.get('content-type'));
  console.log(text.slice(0,220).replace(/\n/g,'\\n'));
}
await server.stop();
