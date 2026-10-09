// 123 · kolečko · 1.7.0 (spec § 1.7): výsledek kolečka je pod 6 000 znaků (běh sonnet-5-5: 8,3 k, useknuto). Po závěru jdou
// follow-upy, odmítnuté a reporty jen počtem a cestou docs/.vysledek-kolecko.json; plné znění dostane závěr k zápisu do souboru.
import { argsKolecko, kontrola, stub, oprava, CWD } from '../stuby.mjs'

const DLOUHE = Array.from({ length: 40 }, (_, i) => `FU-123-${i} ${'x'.repeat(300)}`)

export default {
  nazev: 'kolečko: návrat pod 6 000 se seznamy v souboru',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'review:kolečko:1') return stub(label, { nalezu: 1, blokujicich: 0, report_path: `${CWD}/r1.md`, balicky: [{ soubory: ['apps/sucho/a.ts'], nalezy: ['N1'] }] })
    if (label === 'fix:kolečko:kolo 1:1') return oprava({ opravene_ids: ['N1'], follow_ups: DLOUHE })
    if (label === 'závěr:kolečko') return { ok: true, review_passed: true, chybejici_commity: [], vysledek_soubor: `${CWD}/docs/.vysledek-kolecko.json` }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', follow_ups_pocet: 40, vysledek_soubor: `${CWD}/docs/.vysledek-kolecko.json` })
    k.ok(v && JSON.stringify(v).length < 6000, `návrat má ${v && JSON.stringify(v).length} znaků`)
    k.ok(v && !('follow_ups' in v) && !('odmitnute' in v) && !('reports' in v), 'seznamy po závěru v návratu')
    const z = k.jeden('závěr:kolečko')
    k.obsahuje(z, `${CWD}/docs/.vysledek-kolecko.json`, 'soubor plných seznamů'); k.obsahuje(z, 'FU-123-39', 'poslední follow-up celý')
    k.pole(z, ['vysledek_soubor'], 'CLOSE')
    return k.chyby
  },
}
