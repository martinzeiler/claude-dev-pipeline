// 123b · kolečko · revize 1.7.0 (code-review N5): dlouhé texty vadných a částečných kritérií E2E nenechají návrat kolečka nad
// limitem. Zkracování je zahrne (položky na 240 znaků, pak ubírání s logem a zkraceno), návrat je pod 6 000 znaků.
import { argsKolecko, kontrola, e2ePass, CWD } from '../stuby.mjs'

const VADNA = Array.from({ length: 30 }, (_, i) => `AK${i + 1} Populace nočních běhů: nesplnitelné v prostředí E2E, ${'d'.repeat(500)}`)
const CASTECNA = Array.from({ length: 20 }, (_, i) => `AK${i + 40} Export reportu: PASS-částečně, ${'c'.repeat(400)}`)

export default {
  nazev: 'kolečko: návrat pod 6 000 i s dlouhými kritérii E2E',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'e2e:kolečko:1') return e2ePass(60, { pass: 10, castecne: 20, vadna_kriteria: VADNA, castecna_kriteria: CASTECNA, report_path: `${CWD}/e2e.md` })
    if (label === 'závěr:kolečko') return { ok: true, review_passed: true, chybejici_commity: [], vysledek_soubor: `${CWD}/docs/.vysledek-kolecko.json` }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    k.ok(v && JSON.stringify(v).length <= 5800, `návrat má ${v && JSON.stringify(v).length} znaků`)
    k.ok(v && v.zkraceno && Object.keys(v.zkraceno).some(x => /^e2e\./.test(x)), `zkraceno: ${JSON.stringify(v && v.zkraceno)}`)
    k.ok(v && v.e2e && (v.e2e.vadna_kriteria || []).every(x => x.length <= 240), 'položky vadných kritérií zkrácené')
    return k.chyby
  },
}
