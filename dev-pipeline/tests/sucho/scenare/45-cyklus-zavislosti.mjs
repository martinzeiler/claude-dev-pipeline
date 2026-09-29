// 45 · stavba · revize 1.4.0 nález 11: cyklus v zavisi_na (K1 ↔ K2). Vada vstupu, kterou opakování ani diagnóza neodstraní:
// blok ji pozná topologickým řazením před prvním pokusem a hned vrátí selhání implementace, bez jediného agenta.
import { argsStavby, casti, kontrola, S } from '../stuby.mjs'

export default {
  nazev: 'cyklus v zavisi_na',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1', ['K2']], ['K2', ['K1']], ['K3']]), kontrakt_potreba: true }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'implementace', pokusy: 0 })
    k.ok(/cyklus v zavisi_na: K1 → K2 → K1/.test(S(v && v.detail)), `návrat.detail: ${JSON.stringify(v && v.detail)}`)
    k.ok(volani.length === 0, `blok spustil agenty: ${volani.map(x => x.label).join(', ')}`)
    return k.chyby
  },
}
