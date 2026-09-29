// 09 · stavba · deploy failed s infra: true (§ 3 Pokusy): blok hned zastaví, pokus se nepočítá, žádný další pokus ani diagnóza.
import { argsStavby, kontrola, stub, hash, S } from '../stuby.mjs'

export default {
  nazev: 'deploy failed + infra zastaví blok',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'failed', infra: true, commit: hash('rez 05'), duvod: 'INFRA: railway whoami: nepřihlášen' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-infra', infra: true, pokusy: 1, rozhodnuti: [] })
    k.ok(S(v && v.detail).includes('INFRA'), 'návrat.detail nenese důvod selhání deploye')
    k.pole(k.jeden('deploy:řez 05:1'), ['infra'], 'DEPLOY')
    k.pocet(/^deploy:/, 1, 'jediný deploy')
    k.nic(/^diagnose:/, 'diagnóza po infra selhání')
    k.nic(/^implement:řez 05:[2-9]/, 'další pokus po infra selhání')
    k.nic(/^(e2e|kriteria):/, 'E2E po infra selhání')
    return k.chyby
  },
}
