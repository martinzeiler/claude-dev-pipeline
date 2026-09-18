// Syntax check for Claude Code Workflow scripts: body runs inside an async function with top-level return allowed.
import fs from 'node:fs'
import vm from 'node:vm'
for (const f of process.argv.slice(2)) {
  let src = fs.readFileSync(f, 'utf8').replace(/^export const meta/m, 'const meta')
  try { new vm.Script(`(async function(){\n${src}\n})`, { filename: f }); console.log(`OK  ${f}`) }
  catch (e) { console.log(`ERR ${f}: ${e.message}`); process.exitCode = 1 }
}
