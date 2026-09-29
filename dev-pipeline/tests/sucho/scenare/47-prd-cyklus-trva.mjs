// 47 · PRD · revize 1.4.0 nález 11: cyklus v tabulce Části trvá i po zapracování kostry. Blok končí ok: false s důvodem,
// autoři částí nepíšou a stavba nedostane části, které nejde postavit.
import { argsPrd, kontrola, stub, S } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

const S_CYKLEM = CASTI3.map(c => c.id === 'K1' ? { ...c, zavisi_na: ['K3'] } : c)

export default {
  nazev: 'PRD: cyklus v tabulce Části trvá',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: S_CYKLEM, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-fix:řez 05') return stub(label, { casti: S_CYKLEM, zmenena_mista: [] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.ok(/cyklus v zavisi_na/.test(S(v && v.duvod)), `návrat.duvod: ${JSON.stringify(v && v.duvod)}`)
    k.pocet(/^prd-fix:řez 05$/, 1, 'jedno zapracování kostry')
    k.nic(/^prd-část:/, 'autoři částí nad cyklem')
    k.nic(/^prd-check:/, 'kontrola nad cyklem')
    return k.chyby
  },
}
