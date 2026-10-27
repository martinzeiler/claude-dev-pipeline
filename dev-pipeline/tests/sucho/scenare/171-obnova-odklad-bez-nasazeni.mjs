// 171 · stavba · 1.9.0 (§ 1.1, § 9): odklad nasazení (deploy-odklad) bez doloženého nasazení; obnova od deploye v pokusu 1 s cache
// nevolá před deployem nic živě (implementace, review ani brána), obnova-stav vrátí nedoložené nasazení a deploy proběhne se značkou.
import { argsStavby, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const Z = 'ZNACKA-171'

export default {
  nazev: 'obnova po odkladu nasazení: nic před deployem neběží živě',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'odlozeno', nejdriv: '2026-01-01T06:00:00+01:00', duvod: 'zakázané okno' })
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad', pokusy: 1, nejdriv: '2026-01-01T06:00:00+01:00' })
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'deploy', znacka: Z, pokus: 1 } }), odpoved: () => null }, { cache: volani })
    k.ok(obnova.vysledek && obnova.vysledek.vysledek === 'hotovo', `obnova: ${JSON.stringify(obnova.vysledek && obnova.vysledek.vysledek)}`)
    const zive = obnova.volani.filter(x => !x.z_cache)
    k.rovno(zive.map(x => x.label), ['obnova-stav:řez 05', 'deploy:řez 05:1', 'e2e:řez 05:1', 'uzavření:řez 05'], 'živá volání obnovy')
    k.rovno(obnova.volani.filter(x => x.z_cache).map(x => x.label), ['implement:řez 05:1', 'review:řez 05:1', 'thermo:řez 05', 'verify:řez 05:1'], 'volání z cache')
    k.obsahuje(zive.find(x => x.label === 'deploy:řez 05:1'), Z, 'značku obnovy v deployi')
    return k.chyby
  },
}
