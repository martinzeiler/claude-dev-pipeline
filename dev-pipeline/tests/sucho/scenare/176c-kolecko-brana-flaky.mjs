// 176c · kolečko · 1.9.0 (§ 4.3, review N12): schéma brány kolečka nese flaky jako ve stavbě; do 3 testů zelená s follow-upem, nad 3 červená.
import { argsKolecko, kontrola, zelenaBrana } from '../stuby.mjs'

export default {
  nazev: 'kolečko: brána s flaky',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label, prompt, o, stav) {
    if (/^verify:kolečko:.*:1$/.test(label) && stav.pocty[label] === 1) return zelenaBrana({ flaky: stav.data.cervena ? [] : ['a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    const prvni = volani.find(x => /^verify:kolečko:/.test(x.label))
    k.pole(prvni, ['flaky'], 'VERIFY kolečka')
    k.ok(volani.some(x => /^fix-brana:kolečko/.test(x.label)), 'oprava brány po 4 flaky')
    k.ok(logy.some(l => /4 testů prošlo až samostatně po timeoutu \(strop 3\)/.test(l)), 'log červené brány')
    return k.chyby
  },
}
