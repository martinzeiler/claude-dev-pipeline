// Syntax check for Claude Code Workflow scripts: body runs inside an async function with top-level return allowed.
// Navíc jména souborů: Claude Code (2.1.284) subagentům blokuje zápis markdownu se jmény summary, findings, analysis
// a report-… („Subagents should return findings as text, not write report files“, analýza běhu bez-dluhu 5.7 a 5.9).
// Cesta .md v řetězci bloku, jejíž jméno souboru (bez adresáře) takové slovo nese, je chyba s číslem řádku.
import fs from 'node:fs'
import vm from 'node:vm'
const ZAKAZANE = /summary|findings|analysis|report-/i
function jmenaSouboru(src) {
  const chyby = []
  src.split('\n').forEach((radek, i) => {
    if (/^\s*(\/\/|\*)/.test(radek)) return  // komentář není cesta, kterou agent dostane
    for (const m of radek.matchAll(/([^\s'"`/]*)\.md(?![A-Za-z0-9_])/g)) {
      const z = m[1].match(ZAKAZANE)
      if (z) chyby.push(`řádek ${i + 1}: ${m[1]}.md obsahuje „${z[0]}“ (Claude Code subagentům zápis zablokuje; pojmenuj česky podle vzoru rez-NN-<co>.md)`)
    }
  })
  return chyby
}
for (const f of process.argv.slice(2)) {
  let src = fs.readFileSync(f, 'utf8').replace(/^export const meta/m, 'const meta')
  let ok = true
  try { new vm.Script(`(async function(){\n${src}\n})`, { filename: f }) }
  catch (e) { console.log(`ERR ${f}: ${e.message}`); ok = false }
  for (const c of jmenaSouboru(src)) { console.log(`ERR ${f}: ${c}`); ok = false }
  if (ok) console.log(`OK  ${f}`)
  else process.exitCode = 1
}
