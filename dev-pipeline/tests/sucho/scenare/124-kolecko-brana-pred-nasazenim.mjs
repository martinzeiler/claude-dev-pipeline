// 124 · kolečko · 1.7.0 (spec § 1.7, § 1.13): brána před nasazením se nepouští, když poslední brána (po kole 1) byla zelená a od ní
// žádná oprava nesahala do stromu (běh sonnet-5-5: 4,7 min navíc nad týmž stromem). Rychlé kontroly jdou fix agentům kolečka.
// Kontrola: bez jediné brány před nasazením (výchozí stuby, scénáře 97 a další) brána před nasazením běží.
import { argsKolecko, kontrola, stub, oprava, CWD } from '../stuby.mjs'

const RK = 'pnpm verify:arch'

export default {
  nazev: 'kolečko: brána před nasazením jen nad změněným stromem',
  blok: 'blok-kolecko',
  args: argsKolecko({ rychle_kontroly: RK }),
  odpoved(label) {
    if (label === 'review:kolečko:1') return stub(label, { nalezu: 1, blokujicich: 0, report_path: `${CWD}/r1.md`, balicky: [{ soubory: ['apps/sucho/a.ts'], nalezy: ['N1'] }] })
    if (label === 'fix:kolečko:kolo 1:1') return oprava({ opravene_ids: ['N1'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.jeden('verify:kolečko:kolo 1:1')
    k.nic(/^verify:kolečko:před nasazením/, 'brána před nasazením nad nezměněným stromem')
    k.ok(logy.some(l => /brána před nasazením: poslední brána \(po fázi Code-review 1\) je zelená/.test(l)), 'log přeskočené brány')
    k.obsahuje(k.jeden('fix:kolečko:kolo 1:1'), `rychlé kontroly nad celým stromem: ${RK}`, 'rychlé kontroly')
    return k.chyby
  },
}
