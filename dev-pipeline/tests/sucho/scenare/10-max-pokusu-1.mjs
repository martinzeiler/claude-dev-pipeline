// 10 · stavba · max_pokusu 1 a selhání (§ 3 Pokusy): jeden pokus, žádná diagnóza (dnešní n === MAX_POKUSU by ji pustil před pokusem 1).
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'max_pokusu 1 a selhání',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 1 }),
  odpoved(label) {
    if (/^implement:řez 05:\d+$/.test(label)) return stub(label, { stav: 'selhalo', souhrn: 'testy nejdou spustit: chybí fixture' })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'selhalo', faze: 'implementace', pokusy: 1 })
    k.nic(/^diagnose:/, 'diagnóza při max_pokusu 1')
    k.pocet(/^implement:/, 1, 'jediná implementace')
    return k.chyby
  },
}
