// 185 · stavba · 1.10.0 (spec H2; třída N4): deploy vrací u infra selhání třídu. Dočasný výpadek platformy (platforma) zastaví blok
// s fází deploy-vypadek a infra_trida platforma (orchestrátor obnovu zkusí sám po ~30 min); náprava člověkem (clovek) a starší návrat
// bez třídy zůstávají deploy-infra. Obnova od fáze „deploy-vypadek“ jde od deploye (malý řez: fáze před deployem z cache).
import { argsStavby, kontrola, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const VYPADEK = { stav: 'failed', infra: true, infra_trida: 'platforma', duvod: 'Railway: Deploys have been paused temporarily (status.railway.com incident)' }

export default {
  nazev: 'výpadek platformy: zastavení deploy-vypadek',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: label => label === 'deploy:řez 05:1' ? stub(label, VYPADEK) : null,
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-vypadek', infra: true, infra_trida: 'platforma', pokusy: 1 })
    const d = k.jeden('deploy:řez 05:1')
    k.obsahuje(d, 'infra_trida: clovek', 'třídy infra v zadání deploye'); k.pole(d, ['infra_trida'], 'DEPLOY')
    for (const [x, popis] of [[{ infra_trida: 'clovek' }, 'člověk'], [{}, 'bez třídy']]) {
      const b = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'deploy:řez 05:1' ? stub(l, { stav: 'failed', infra: true, duvod: 'token vypršel', ...x }) : null })
      k.ok(b.vysledek && b.vysledek.faze === 'deploy-infra' && !b.vysledek.infra_trida, `${popis}: ${JSON.stringify(b.vysledek && [b.vysledek.faze, b.vysledek.infra_trida])}`)
    }
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'deploy-vypadek', znacka: 'Z185', pokus: 1 } }), odpoved: () => null }, { cache: volani })
    k.ok(obnova.vysledek && obnova.vysledek.vysledek === 'hotovo', `obnova: ${JSON.stringify(obnova.vysledek && obnova.vysledek.vysledek)}`)
    k.rovno(obnova.volani.filter(x => !x.z_cache).map(x => x.label), ['obnova-stav:řez 05', 'deploy:řez 05:1', 'e2e:řez 05:1', 'uzavření:řez 05'], 'obnova od deploy-vypadek jde od deploye')
    k.obsahuje(obnova.volani.find(x => x.label === 'deploy:řez 05:1' && !x.z_cache), 'Z185', 'značku obnovy v deployi')
    return k.chyby
  },
}
