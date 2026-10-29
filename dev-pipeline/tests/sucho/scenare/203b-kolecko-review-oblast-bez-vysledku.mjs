// 203b · kolečko · 1.10.0 (spec C5): reviewer jedné oblasti nevrátí výsledek ani po opakování. Neprověřená oblast je mezera v review,
// kolečko selže ve fázi code-review kolo 1 (obnova od kola 1) a opravná vlna se nespustí.
import { argsKolecko, kontrola, NIC, S } from '../stuby.mjs'

export default {
  nazev: 'kolečko: reviewer oblasti bez výsledku, kolečko selže',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'oblasti:kolečko') return { oblasti: [{ nazev: 'api', cesty: ['apps/api'] }, { nazev: 'web', cesty: ['apps/web'] }] }
    if (label === 'review:kolečko:1:2') return NIC
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'code-review kolo 1', obnova_od: 'kolo 1' })
    k.ok(/review:kolečko:1:2|code-review agent nevrátil výsledek/.test(S(v && v.detail)), `návrat.detail: ${v && v.detail}`)
    k.nic(/^fix:kolečko:kolo 1/, 'opravná vlna bez celého review')
    return k.chyby
  },
}
