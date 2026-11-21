// 125 · kolečko · 1.7.0 (spec § 1.3): deploy kolečka vrátí odlozeno s nejdriv. Kolečko zastaví s fází deploy-odklad, časem nejdriv
// a obnovou od deploye; není to infra ani selhání, E2E a závěr se nespustí. Práh odkladu je od 1.12.0 (spec Q1) ~60 minut, jako ve stavbě.
import { argsKolecko, kontrola, stub } from '../stuby.mjs'

const KDY = '2026-10-07T02:30:00+02:00'

export default {
  nazev: 'kolečko: odklad nasazení',
  blok: 'blok-kolecko',
  args: argsKolecko({ deploy_okno: '00:45–01:20' }),
  odpoved: label => label === 'deploy:kolečko:1' ? stub(label, { stav: 'odlozeno', nejdriv: KDY, duvod: 'zakázané okno' }) : null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad', nejdriv: KDY, obnova_od: 'deploy', review_passed: false })
    k.ok(v && !v.infra, 'odklad není infra')
    k.nic(/^(e2e|e2e-scénáře|závěr):kolečko/, 'po odkladu nic dalšího')
    const d = k.jeden('deploy:kolečko:1')
    k.obsahuje(d, 'vrať stav odlozeno s nejdriv', 'pravidlo odkladu')
    k.obsahuje(d, 'nesmí proběhnout dřív než za ~60 minut', 'práh odkladu'); k.obsahuje(d, 'které i s rezervou skončí do ~60 minut, přečkej čekací smyčkou', 'kratší okno se přečká')
    k.obsahuje(d, 'Zakázané okno nasazení: 00:45–01:20; když do něj spadáš, počkej do jeho konce a ještě 10 minut rezervy, jen když to celé trvá nejvýš ~60 minut', 'okno z args se stejným prahem')
    k.neobsahuje(d, '~30', 'starý práh odkladu')
    return k.chyby
  },
}
