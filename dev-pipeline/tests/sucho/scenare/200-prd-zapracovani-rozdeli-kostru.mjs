// 200 · PRD · 1.10.0 (spec B1, B2, kontrakt 1): zapracování nálezů orchestrátora rozdělí kostru na víc částí (běh zaklad-dat, řez 18:
// K1–K7 v kostře, blok vrátil stavbě čtyři části). Agent vrací id z frontmatteru v casti_v_kostre; rozdíl proti částem bloku je
// ok: false s výčtem obou tabulek, bez pole stavba. Zadání zapracování říká, že část se nedělí a přerostlá jde do casti_nalezy.
import { argsPrd, kontrola, rozhrani, stub, prdCasti, CWD, S } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const CASTI = CASTI3.map(c => ({ ...c, prd_path: prdCasti(c.id) }))

export default {
  nazev: 'PRD: zapracování rozdělí kostru, blok skončí ok: false',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['chybí pokrytí bodu F6.8', 'rozděl části nad ~800 ř.'], puvodni: { casti: CASTI, kriteria: 14 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 15, casti: CASTI3, casti_v_kostre: ['K1', 'K2', 'K3', 'K4', 'K5'], zmenena_mista: ['Části: K1 rozdělena na K1 a K4, K3 na K3 a K5'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false, rez: '05' })
    k.ok(/zapracování změnilo tabulku Částí \(kostra: K1, K2, K3, K4, K5, blok: K1, K2, K3\)/.test(S(v && v.duvod)), `návrat.duvod: ${JSON.stringify(v && v.duvod)}`)
    k.ok(!v || !v.stavba, 'návrat bez pole stavba')
    const f = k.jeden('prd-fix:řez 05')
    k.obsahuje(f, 'Část nerozděluj a novou nezakládej, ani když o to nález žádá', 'zákaz dělení části v zapracování')
    k.obsahuje(f, 'vrať v casti_nalezy', 'přerostlá část jako nález'); k.obsahuje(f, 'casti_v_kostre', 'id z frontmatteru')
    k.pole(f, ['casti_v_kostre', 'casti_nalezy'], 'zapracování')
    k.nic(/^prd-check:/, 'delta kontrola po rozbité tabulce')
    k.ok(logy.some(l => l.includes('rozhodne orchestrátor')), 'log o konci bloku')
    rozhrani(k, volani)
    return k.chyby
  },
}
