// 163b · PRD · 1.8.0 casti_odebrane bez nálezu, který odebrání žádá (spec 1.8.0 § 2.4): blok odebrání ignoruje, části zůstávají.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const CASTI = CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) }))

export default {
  nazev: 'PRD: casti_odebrane bez žádosti orchestrátora se ignoruje',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['odchylka od plánu: doplň F3'], puvodni: { casti: CASTI, kriteria: 14 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, casti_odebrane: ['K3'], zmenena_mista: ['AK7'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, rezim: 'zapracovani', casti_pocet: 3 })
    k.rovno(((v && v.stavba) || {}).casti && v.stavba.casti.map(c => c.id), ['K1', 'K2', 'K3'], 'stavba.casti beze změny')
    k.ok(logy.some(l => l.includes('casti_odebrane K3, ale žádný nález orchestrátora odebrání nežádá: ignoruji')), 'log ignorovaného odebrání')
    rozhrani(k, volani)
    return k.chyby
  },
}
