// 110 · stavba · 1.7.0 (spec § 1.4): načítací agent vrátí „obnova: {}“ (běh sonnet-5-5, stavby 01 a 03). Obnova ze souboru se maže,
// blok běží jako nový a žádné zadání nenese větu obnovy; jinak by skutečná obnova minula cache a přehrála celou stavbu.
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'obnova {} ze souboru se ignoruje',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsStavby(), rez: '05', obnova: {} }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const a = k.jeden('args:řez 05')
    k.ok(a && !a.klice.includes('obnova'), 'schéma načítacího agenta nabízí pole obnova')
    for (const x of volani) k.neobsahuje(x, 'Obnova běhu (', 'větu obnovy')
    return k.chyby
  },
}
