// 206 · kolečko · 1.10.0 (spec H2, kontrakt 4): deploy kolečka vrátí infra selhání třídy platforma (pauza nasazení platformy). Kolečko
// zastaví s fází deploy-vypadek a obnovou od deploy (orchestrátor obnoví cronem, člověka volá až po ~6 h); třída clovek zůstává
// deploy-infra.
import { argsKolecko, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'kolečko: výpadek platformy zastaví s fází deploy-vypadek',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'deploy:kolečko:1') return stub(label, { stav: 'failed', infra: true, infra_trida: 'platforma', duvod: 'Deploys have been paused temporarily (status.railway.com: incident)' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-vypadek', obnova_od: 'deploy', infra: true, infra_trida: 'platforma' })
    const d = k.jeden('deploy:kolečko:1')
    k.obsahuje(d, 'infra_trida: clovek', 'třídy infra selhání v zadání'); k.pole(d, ['infra_trida'], 'deploye')
    k.nic(/^e2e/, 'E2E po výpadku')
    return k.chyby
  },
}
