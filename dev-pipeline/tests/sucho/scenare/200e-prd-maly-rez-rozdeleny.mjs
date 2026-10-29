// 200e · PRD · 1.10.0 (review N10): malý řez (předchozí návrat bez částí) zapracování rozdělí na části proti zákazu v zadání.
// Blok měří kostru proti tabulce, kterou zná (prázdné), ne proti částem, které zapracování právě vrátilo: rozdíl je ok: false.
import { argsPrd, kontrola, stub, CWD, S } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

export default {
  nazev: 'PRD: zapracování rozdělí malý řez na části, blok skončí ok: false',
  blok: 'blok-prd',
  args: argsPrd({ rezim: 'zapracovani', prd_path: `${CWD}/docs/prd/rez-05-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-05.md`, nalezy: ['řez je velký, rozděl ho na části'], puvodni: { casti: [], kriteria: 8 } }),
  odpoved(label) {
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 9, casti: CASTI3, casti_v_kostre: ['K1', 'K2', 'K3'], zmenena_mista: ['Části: nová tabulka'] })
    return null
  },
  over(v) {
    const k = kontrola([])
    k.navrat(v, { ok: false, rez: '05' })
    k.ok(/zapracování změnilo tabulku Částí \(kostra: K1, K2, K3, blok: –\)/.test(S(v && v.duvod)), `návrat.duvod: ${JSON.stringify(v && v.duvod)}`)
    return k.chyby
  },
}
