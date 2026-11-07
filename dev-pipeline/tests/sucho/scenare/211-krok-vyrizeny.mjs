// 211 · stavba · 1.11.0 (spec B1; řez 13, 54 agentů, $89): krok nevztahuje-se je vyřízený. Další nasazení ho smí vrátit jako vynechano „provedeno
// v předchozím nasazení“ a blok to nebere jako selhání; obnova-stav vrací oba stavy.
import { argsStavby, kontrola, stub, hash } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const VYNECHANE = [{ id: 1, krok: 'migrace evidence', stav: 'vynechano', duvod: 'provedeno v předchozím nasazení' }, { id: 2, krok: 'jen když S5: snížit effort', stav: 'vynechano', duvod: 'provedeno v předchozím nasazení' }]

export default {
  nazev: 'krok nevztahuje-se je vyřízený i v dalším nasazení',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'deploy:řez 05:1') return stub(label, { kroky_po_nasazeni: [{ id: 1, krok: 'migrace evidence', stav: 'provedeno' }, { id: 2, krok: 'jen když S5: snížit effort', stav: 'nevztahuje-se', duvod: 'S5 nenastalo' }, { id: 3, krok: 'seed', stav: 'selhalo', duvod: 'timeout' }] })
    if (label === 'deploy:řez 05:p2:1') return stub(label, { kroky_po_nasazeni: [...VYNECHANE, { id: 3, krok: 'seed', stav: 'provedeno' }] })
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.nic(/^implement:řez 05:2$/, 'dorovnání bez implementace')
    k.obsahuje(k.jeden('deploy:řez 05:p2:1'), 'už provedlo: 1. migrace evidence | 2. jen když S5: snížit effort (nevztahuje se)', 'vyřízené kroky v zadání dalšího nasazení')
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'deploy', znacka: 'Z211', pokus: 1, bez_cache: true } }), odpoved: l => {
      if (l === 'obnova-stav:řez 05') return { commit_rezu: hash('r211'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [{ id: 1, krok: 'migrace evidence', stav: 'provedeno' }, { id: 2, krok: 'jen když S5: snížit effort', stav: 'nevztahuje-se' }] }
      if (l === 'deploy:řez 05:1') return stub(l, { kroky_po_nasazeni: VYNECHANE })
      return null
    } })
    const o = kontrola(obnova.volani)
    o.navrat(obnova.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    o.obsahuje(o.jeden('obnova-stav:řez 05'), 'se stavem provedeno nebo nevztahuje-se', 'obnova-stav vrací oba stavy')
    o.obsahuje(o.jeden('deploy:řez 05:1'), '2. jen když S5: snížit effort (nevztahuje se)', 'krok nevztahuje-se z přerušeného běhu')
    k.chyby.push(...o.chyby.map(x => `obnova: ${x}`))
    return k.chyby
  },
}
