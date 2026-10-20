// 165 · PRD · 1.8.0 oblasti sekcí E2E (spec 1.8.0 § 2.12): architekt vrací u každé sekce oblasti PRD, blok je beze změny
// předá stavbě v stavba.e2e_sekce (stavba po opravě přeměřuje jen dotčené sekce); sekce bez oblastí pole nemá.
import { argsPrd, kontrola, rozhrani, stub } from '../stuby.mjs'

const SEKCE = [
  { nazev: 'Rozpočty API', kriterii: 5, doba_min: 12, oblasti: ['api/rozpocty', 'db/rozpocty'] },
  { nazev: 'Rozpočty UI', kriterii: 4, doba_min: 9, bez_soubehu: true, oblasti: ['web/rozpocty'] },
  { nazev: 'Export', kriterii: 2 },
]

export default {
  nazev: 'PRD: oblasti sekcí E2E jdou stavbě',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 11, e2e_sekce: SEKCE })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    k.rovno(v && v.stavba && v.stavba.e2e_sekce, SEKCE, 'stavba.e2e_sekce s oblastmi')
    const ar = k.jeden('prd:řez 05')
    k.obsahuje(ar, 'a oblasti (oblasti PRD, kterých se sekce dotýká; stavba po opravě přeměřuje jen dotčené sekce)', 'pokyn k oblastem sekcí')
    if (ar) {
      const sk = ar.schema.properties.e2e_sekce.items.properties
      k.ok(sk && sk.oblasti, 'PRD_SCHEMA.e2e_sekce bez pole oblasti')
    }
    rozhrani(k, volani)
    return k.chyby
  },
}
