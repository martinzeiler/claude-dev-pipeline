// 33 · kolečko · revize 1.4.0 nález 3: thermo předá práci, nástupce zopakuje cestu předávky předchůdce. Ozvěna není nová předávka:
// návrat nástupce je konečný, kolečko doběhne s jedinou předávkou.
import { argsKolecko, kontrola, CWD } from '../stuby.mjs'

const P = `${CWD}/docs/reviews/predavka-thermo33.md`

export default {
  nazev: 'kolečko: ozvěna předávky předchůdce',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label.startsWith('thermo:kolečko')) return { blokeru: 0, nalezu: 0, report_path: `${CWD}/docs/reviews/kolecko-thermo.md`, soubory: [], souhrn: 'stub', predavka: P }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', predavky: 1 })
    k.pocet(/^thermo:kolečko:n2$/, 1, 'nástupce thermo')
    k.nic(/^thermo:kolečko:n3$/, 'nástupce po ozvěně předávky')
    return k.chyby
  },
}
