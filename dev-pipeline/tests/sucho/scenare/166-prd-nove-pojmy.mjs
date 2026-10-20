// 166 · PRD · 1.8.0 nové pojmy (spec 1.8.0 § 2.13): architekt, autoři částí i zapracování vracejí nove_pojmy; blok je sjednotí
// do stavba.nove_pojmy (sklizeň je připíše do docs/pojmy.md) a pro orchestrátora jen krátkým výčtem.
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

export default {
  nazev: 'PRD: nové pojmy ze všech agentů do návratu stavby',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true, nove_pojmy: ['reel: krátké video destinace'] })
    if (label === 'prd-část:řez 05:K1') return stub(label, { nove_pojmy: ['slot: časové okno exportu'] })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    if (label === 'prd-fix:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, zmenena_mista: ['AK1'], nove_pojmy: ['reel: krátké video destinace', 'okno: interval měření'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    k.rovno(v && v.stavba && v.stavba.nove_pojmy, ['reel: krátké video destinace', 'slot: časové okno exportu', 'okno: interval měření'], 'stavba.nove_pojmy sjednocené')
    k.rovno(v && v.nove_pojmy, ['reel: krátké video destinace', 'slot: časové okno exportu', 'okno: interval měření'], 'nove_pojmy pro orchestrátora')
    const ar = k.jeden('prd:řez 05')
    k.obsahuje(ar, 'Pojmy kostry ber z docs/pojmy.md, když existuje; nové termíny vrať v nove_pojmy', 'pokyn architektovi')
    k.pole(ar, ['nove_pojmy', 'prostredi', 'casti_odebrane'], 'PRD_SCHEMA')
    const au = k.jeden('prd-část:řez 05:K1')
    k.obsahuje(au, 'nové termíny projektu vrať v nove_pojmy', 'pokyn autorovi části')
    k.pole(au, ['nove_pojmy'], 'CAST_SCHEMA')
    rozhrani(k, volani)
    return k.chyby
  },
}
