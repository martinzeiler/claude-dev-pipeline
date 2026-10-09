// 115 · stavba · 1.7.0 (spec § 1.4): args_file bez _pole (soubor ze staršího skriptu) projde s logem, opis se nekontroluje.
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'args_file bez _pole projde s logem',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json' },
  odpoved: label => label === 'args:řez 05' ? { ...argsStavby(), rez: '05' } : null,
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pocet(/^args:řez 05$/, 1, 'jedno načtení')
    k.ok(logy.some(l => /bez _pole/.test(l)), 'log o souboru bez _pole')
    return k.chyby
  },
}
