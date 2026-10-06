// 92 · stavba · 1.6.0 (spec § 1.3): args ze souboru se správným řezem („05“ v souboru, 5 ve volání) proběhnou jako plné args;
// pole volání mají přednost před souborem. Chyba načítacího agenta (soubor chybí) blok ukončí s jejím důvodem.
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'args_file se správným řezem',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: `${CWD}/docs/.stavba-05.json`, max_pokusu: 1 },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsStavby({ max_pokusu: 3, hypotezy: { text: ['HYP-92 strom po řezu 04'] } }), rez: '05' }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const a = k.jeden('args:řez 05'), i = k.jeden('implement:řez 05:1')
    k.pred(a, i)
    k.obsahuje(i, 'Pokus 1 z 1', 'max_pokusu z volání má přednost před souborem')
    k.obsahuje(i, 'HYP-92', 'hypotézy ze souboru')
    return k.chyby
  },
}
