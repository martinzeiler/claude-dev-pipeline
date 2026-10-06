// 102 · PRD · 1.6.0 od_faze bez puvodni (spec 1.6.0 § 1.8): blok nic nespustí a vrátí ok: false s důvodem; architekta nepustí
// znovu (pokračování nesmí po tichu napsat novou kostru přes tu, nad kterou orchestrátor rozhodoval).
import { argsPrd, kontrola, S } from '../stuby.mjs'

export default {
  nazev: 'PRD: od_faze autori bez puvodni',
  blok: 'blok-prd',
  args: argsPrd({ od_faze: 'autori' }),
  odpoved() { return null },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: false })
    k.ok(/puvodni/.test(S(v && v.duvod)), `návrat.duvod bez puvodni: ${JSON.stringify(v && v.duvod)}`)
    k.pocet(/./, 0, 'žádné volání bez puvodni')
    return k.chyby
  },
}
