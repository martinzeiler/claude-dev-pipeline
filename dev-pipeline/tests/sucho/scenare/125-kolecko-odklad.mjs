// 125 · kolečko · 1.7.0 (spec § 1.3): deploy kolečka vrátí odlozeno s nejdriv. Kolečko zastaví s fází deploy-odklad, časem nejdriv
// a obnovou od deploye; není to infra ani selhání, E2E a závěr se nespustí.
import { argsKolecko, kontrola, stub } from '../stuby.mjs'

const KDY = '2026-10-07T02:30:00+02:00'

export default {
  nazev: 'kolečko: odklad nasazení',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: label => label === 'deploy:kolečko:1' ? stub(label, { stav: 'odlozeno', nejdriv: KDY, duvod: 'zakázané okno' }) : null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad', nejdriv: KDY, obnova_od: 'deploy', review_passed: false })
    k.ok(v && !v.infra, 'odklad není infra')
    k.nic(/^(e2e|e2e-scénáře|závěr):kolečko/, 'po odkladu nic dalšího')
    k.obsahuje(k.jeden('deploy:kolečko:1'), 'vrať stav odlozeno s nejdriv', 'pravidlo odkladu')
    return k.chyby
  },
}
