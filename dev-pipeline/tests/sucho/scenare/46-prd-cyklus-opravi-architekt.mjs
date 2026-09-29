// 46 · PRD · revize 1.4.0 nález 11: architekt vrátí části s cyklem K1 → K3 → K1. Blok to pozná před autory a pustí jedno
// zapracování kostry s nálezem; opravená tabulka jde autorům a do návratu.
import { argsPrd, kontrola, stub } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const S_CYKLEM = CASTI3.map(c => c.id === 'K1' ? { ...c, zavisi_na: ['K3'] } : c)

export default {
  nazev: 'PRD: cyklus v tabulce Části opraví architekt',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: S_CYKLEM, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-fix:řez 05') return stub(label, { casti: CASTI3, zmenena_mista: ['Části: K1 bez závislosti na K3'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const f = k.pocet(/^prd-fix:řez 05$/, 1, 'zapracování kostry s nálezem')[0]
    k.obsahuje(f, 'cyklus v zavisi_na: K1 → K3 → K1', 'nález cyklu')
    for (const a of k.s(/^prd-část:/)) k.pred(f, a)
    k.pocet(/^prd-část:/, 3, 'autoři částí')
    if (v) k.rovno((v.casti || []).map(c => [c.id, c.zavisi_na]), CASTI3.map(c => [c.id, c.zavisi_na]), 'návrat.casti po opravě')
    return k.chyby
  },
}
