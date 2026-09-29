// 39 · stavba · revize 1.4.0 nález 6: řez s částmi, thermo K1 v pokusu 1 najde BLOCKER a fix odmítne blokující nález; brána
// pokusu 1 červená, pokus 2 jde opravou a části znovu nereviduje. Uzavření pokusu 2 dostane thermo report K1 k sesouhlasení
// i odmítnutí z pokusu 1 a návrat hlásí thermo a počty review včetně pokusu 1.
import { argsStavby, casti, kontrola, zelenaBrana, oprava, pokusZ, CWD } from '../stuby.mjs'

export default {
  nazev: 'thermo a odmítnutí částí z pokusu 1 v uzavření pokusu 2',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]) }),
  odpoved(label, p, o, stav) {
    const n = pokusZ(stav)
    if (label === 'thermo:řez 05:část K1') return { blokeru: 1, nalezu: 1, report_path: `${CWD}/docs/reviews/THERMO-K1-39.md`, soubory: ['apps/sucho/k1/modul.ts'], souhrn: 's' }
    if (label === 'fix:řez 05:1.1' && n === 1) return oprava({ odmitnuto: [{ id: 'N1', duvod: 'ODMITNUTO-P1-39', blokuje: true }] })
    if (/^verify:řez 05:[12]$/.test(label) && n === 1) return zelenaBrana({ selhalo: 1, exit_kod: 1 })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.pocet(/^thermo:řez 05:část K1$/, 1, 'thermo K1 jen v pokusu 1')
    const c = k.jeden('uzavření:řez 05')
    k.obsahuje(c, 'THERMO-K1-39', 'thermo report části K1 k sesouhlasení'); k.obsahuje(c, 'ODMITNUTO-P1-39', 'odmítnutý blokující nález z pokusu 1')
    k.ok(v && v.thermo && v.thermo.nalezu === 1 && v.thermo.blokeru === 1, `návrat.thermo: ${JSON.stringify(v && v.thermo)}`)
    k.ok(JSON.stringify((v && v.odmitnute) || []).includes('ODMITNUTO-P1-39'), `návrat.odmitnute: ${JSON.stringify(v && v.odmitnute)}`)
    k.ok(v && v.review && v.review.kola === 2 && v.review.fix_agentu >= 2, `návrat.review (kolo 2 a fix agenti pokusu 1): ${JSON.stringify(v && v.review)}`)
    return k.chyby
  },
}
