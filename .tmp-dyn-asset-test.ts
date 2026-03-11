import { BacklogServer } from "./src/server/index.ts";

const server = new BacklogServer("C:/DEV/ITSM-PLATFORM/cloud-forge");
await server.start(6517, false);
const html = await (await fetch("http://127.0.0.1:6517/")).text();
const emitted = [...html.matchAll(/\/(?:\.\.\/)+([^\"']+)/g)].map((m) => m[1]);
console.log('emitted', emitted);
for (const name of emitted) {
  const rootRes = await fetch(`http://127.0.0.1:6517/${name}`);
  const prefRes = await fetch(`http://127.0.0.1:6517/ITSM-PLATFORM/cloud-forge/${name}`);
  console.log(name, 'root', rootRes.status, 'pref', prefRes.status);
}
await server.stop();
