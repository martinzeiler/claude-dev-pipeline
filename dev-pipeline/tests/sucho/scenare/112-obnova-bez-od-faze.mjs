// 112 · stavba · 1.7.0 (spec § 1.4): obnova ve volání bez od_faze se ignoruje s logem; blok běží jako nový, bez značky.
import { argsStavby, kontrola } from '../stuby.mjs'

export default {
  nazev: 'obnova bez od_faze se ignoruje',
  blok: 'blok-stavby',
  args: argsStavby({ obnova: { znacka: 'ZNACKA-112' } }),
  odpoved: () => null,
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.ok(logy.some(l => /obnova bez od_faze ignorována/.test(l)), 'log „obnova bez od_faze ignorována“')
    for (const x of volani) k.neobsahuje(x, 'ZNACKA-112', 'značku obnovy bez od_faze')
    return k.chyby
  },
}
