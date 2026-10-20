// 149 · stavba · 1.8.0 (spec § 2.9): deploy vrací dveře a dosah řezu; jdou do návratu, do historie nasazení a do souboru výsledku
// pro uzavření; zadání deploye žádá řádek Dveře · Dosah v zápisu nasazení.
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'dveře a dosah řezu v návratu a výsledku',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { dvere: 'jednosměrné', dosah: 'data' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', dvere: 'jednosměrné', dosah: 'data' })
    const d = k.jeden('deploy:řez 05:1')
    k.pole(d, ['dvere', 'dosah'], 'DEPLOY')
    if (d) k.rovno(d.schema.properties.dvere.enum, ['jednosměrné', 'obousměrné'], 'DEPLOY.dvere enum')
    k.obsahuje(d, 'Dveře: jednosměrné | obousměrné · Dosah:', 'řádek dveří a dosahu v zápisu nasazení')
    const uz = k.jeden('uzavření:řez 05')
    k.obsahuje(uz, '"dvere":"jednosměrné"', 'dveře v souboru výsledku'); k.obsahuje(uz, '"dosah":"data"', 'dosah v souboru výsledku')
    return k.chyby
  },
}
