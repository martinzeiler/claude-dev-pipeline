// 148b · kolečko · 1.8.0 (spec § 2.6): bez položek [oprava] se vlna dluhu nekoná: žádný fix, brána ani commit dluhu.
// Od 1.12.0 (spec N2) začíná fáze sběrem čitelnosti: bez položek čitelnosti pokračuje obecným sběrem jako dřív.
import { argsKolecko, kontrola } from '../stuby.mjs'
import { spust } from '../harness.mjs'

export default {
  nazev: 'kolečko: dluh bez položek',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: () => null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', dluh: { polozek: 0, opraveno: 0, odmitnuto: 0, uz_vyreseno: 0, varek: 0, citelnost: { polozek: 0, opraveno: 0, zbyva: 0 } } })
    k.pred(k.jeden('dluh:kolečko:čitelnost'), k.jeden('dluh:kolečko'))
    k.nic(/^dluh:kolečko:čitelnost:2$/, 'druhá várka čitelnosti bez položek')
    k.ok(logy.some(l => /dluh čitelnost: žádná položka čitelnosti k opravě/.test(l)), 'log o prázdné čitelnosti')
    k.nic(/^(fix|verify|commit):kolečko:dluh/, 'bez položek žádná vlna')
    k.ok(logy.some(l => /dluh: žádná položka \[oprava\]/.test(l)), 'log o prázdném dluhu')
    // Bez plugin_root (skript follow-ups.py není kde vzít) se nekoná sběr čitelnosti ani obecného dluhu; návrat drží stejný tvar.
    const bez = await spust({ blok: 'blok-kolecko', args: argsKolecko({ plugin_root: '' }), odpoved: () => null })
    const m = kontrola(bez.volani)
    m.navrat(bez.vysledek, { ok: true, vysledek: 'hotovo', dluh: { polozek: 0, opraveno: 0, odmitnuto: 0, uz_vyreseno: 0, varek: 0, citelnost: { polozek: 0, opraveno: 0, zbyva: 0 } } })
    m.nic(/^dluh:/, 'sběr bez plugin_root'); m.ok(bez.logy.some(l => /dluh: bez plugin_root se vlna dluhu nekoná/.test(l)), 'log bez plugin_root')
    k.chyby.push(...m.chyby.map(x => `bez plugin_root: ${x}`))
    return k.chyby
  },
}
