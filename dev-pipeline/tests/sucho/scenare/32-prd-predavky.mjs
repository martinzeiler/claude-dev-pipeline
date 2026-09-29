// 32 · PRD · revize 1.4.0 nález 3: architekt vyplní predavka textem „žádná“ (není předávka, nástupce nejde) a autor části K2
// předává pořád dál. Blok končí ok: false s důvodem „strop předávek vyčerpán“ u K2, ne „nevrátil výsledek“.
import { argsPrd, kontrola, stub, hash, CWD, S } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

export default {
  nazev: 'PRD: předávka „žádná“ a vyčerpaný strop autora',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true, predavka: 'žádná' })
    if (label.startsWith('prd-část:řez 05:K2')) return stub(label, { predavka: `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md` })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.nic(/^prd:řez 05:n\d$/, 'nástupce architekta po predavka „žádná“')
    k.pocet(/^prd-část:řez 05:K2:n4$/, 1, 'čtvrtý agent řetězu autora K2')
    k.ok(/K2/.test(S(v && v.duvod)) && /strop předávek vyčerpán/.test(S(v && v.duvod)), `návrat.duvod: ${JSON.stringify(v && v.duvod)}`)
    k.ok(logy.some(l => /předávky vyčerpány/.test(l)), 'log „předávky vyčerpány“')
    return k.chyby
  },
}
