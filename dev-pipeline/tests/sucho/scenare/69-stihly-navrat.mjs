// 69 · stavba · 1.5.0 (spec § 1.6): po úspěšném uzavření jdou follow-upy, odchylky a pasti orchestrátorovi jen jako počty
// (zapsalo je uzavření); uzavření je dostane celé. Běh web-podzim: tyto seznamy tvořily 80 % návratu stavby.
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'štíhlý návrat po úspěšném uzavření',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'implement:řez 05:1') return stub(label, { follow_ups: ['FU-69a odstranit past X', 'FU-69b sjednotit Y'], odchylky_od_prd: ['ODCH-69 jiný název pole'], pasti_opravene: ['PAST-69 null v uloz'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', follow_ups: [], odchylky: [], pasti_opravene: [], follow_ups_pocet: 2, odchylky_pocet: 1, pasti_pocet: 1, seznamy_zapsane: true })
    const c = k.jeden('uzavření:řez 05')
    k.obsahuje(c, 'FU-69b', 'follow-upy pro zápis')
    k.obsahuje(c, 'ODCH-69', 'odchylky pro zápis')
    k.agent(c, 'dev-pipeline:uzavreni', 'sonnet', 'medium')
    return k.chyby
  },
}
