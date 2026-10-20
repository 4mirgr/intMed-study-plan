import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../docs/index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
if (!scripts.length) throw new Error("docs/index.html has no inline scripts");
scripts.forEach((source, index) => new vm.Script(source, {filename: `docs/index.html#script-${index + 1}`}));
for (const relative of ["docs/config.js", "docs/js/intmed-backend.js"]) {
  new vm.Script(fs.readFileSync(new URL("../" + relative, import.meta.url), "utf8"), {filename: relative});
}
console.log(`JavaScript syntax passed (${scripts.length} inline block(s) + backend files)`);
