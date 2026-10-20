// 149b · kolečko · 1.8.0 (spec § 2.9): deploy kolečka vrací dveře a dosah do návratu (deploy) a zadání žádá řádek v zápisu nasazení.
import { argsKolecko, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'kolečko: dveře a dosah nasazení',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'deploy:kolečko:1') return stub(label, { dvere: 'obousměrné', dosah: 'web' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.rovno(v && v.deploy && v.deploy.dvere, 'obousměrné', 'návrat.deploy.dvere'); k.rovno(v && v.deploy && v.deploy.dosah, 'web', 'návrat.deploy.dosah')
    k.obsahuje(k.jeden('deploy:kolečko:1'), 'Dveře: jednosměrné | obousměrné · Dosah:', 'řádek dveří a dosahu')
    return k.chyby
  },
}
