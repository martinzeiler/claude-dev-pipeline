// 200b · PRD · 1.10.0 (spec B2, kontrakt 1): zapracování kostry v novém PRD (po autorech) vrátí v casti část K4 navíc a casti_v_kostre
// nevyplní. Bez pole se měří id navíc v casti: blok skončí ok: false (dřív část zahodil s logem „ignoruji“ a stavba ji nepostavila).
import { argsPrd, kontrola, stub, CWD, S } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const K4 = { id: 'K4', nazev: 'Nová část', soubory: ['apps/web/src/novy/**'], kriteria: ['AK6'], odhad_radku: 600, zavisi_na: [] }

export default {
  nazev: 'PRD: zapracování kostry s částí navíc bez casti_v_kostre',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 1, blokujicich: 1, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1'] }
    if (label === 'prd-fix:řez 05') return stub(label, { casti: [...CASTI3, K4], zmenena_mista: ['Části: nová K4'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false, rez: '05' })
    k.ok(/zapracování změnilo tabulku Částí \(kostra: K1, K2, K3, K4, blok: K1, K2, K3\)/.test(S(v && v.duvod)), `návrat.duvod: ${JSON.stringify(v && v.duvod)}`)
    k.obsahuje(k.jeden('prd-fix:řez 05'), 'Přerostlou, chybějící nebo dělenou část vrať v casti_nalezy', 'pravidlo zapracování kostry po autorech')
    k.nic(/^prd-fix:řez 05:část /, 'zapracování částí po rozbité tabulce')
    return k.chyby
  },
}
