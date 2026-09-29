// 23 · stavba · staré e2e_sekce jako pole řetězců (§ 1.7): počet kritérií sekcí blok nezná, rozdělí je na dvě půlky jako dřív,
// dva souběžní verifikátoři a (Alfa, Beta) a b (Gama).
import { argsStavby, kontrola } from '../stuby.mjs'

export default {
  nazev: 'e2e_sekce jako řetězce: dvě půlky',
  blok: 'blok-stavby',
  args: argsStavby({ kriteria: 20, e2e_sekce: ['Sekce Alfa', 'Sekce Beta', 'Sekce Gama'] }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pocet(/^e2e:řez 05:1(:|$)/, 2, 'verifikátoři kola 1')
    const a = k.jeden('e2e:řez 05:1:a'), b = k.jeden('e2e:řez 05:1:b')
    k.soubezne(a, b)
    k.obsahuje(a, 'Sekce Alfa'); k.obsahuje(a, 'Sekce Beta'); k.neobsahuje(a, 'Sekce Gama')
    k.obsahuje(b, 'Sekce Gama'); k.neobsahuje(b, 'Sekce Alfa'); k.neobsahuje(b, 'Sekce Beta')
    return k.chyby
  },
}
