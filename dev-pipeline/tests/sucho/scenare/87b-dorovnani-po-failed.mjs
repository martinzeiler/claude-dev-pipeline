// 87b · stavba · 1.6.0 (plan-check 4): deploy, který commitnul a nasadil, ale selhání kroku po nasazení vrátil jako failed bez infra
// (starší výklad „nasazení selhalo“), spustí v dalším pokusu malého řezu jen dorovnání deploye, ne celý pokus.
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'selhání kroku vrácené jako failed: další pokus jen dorovná deploy',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    if (label === 'deploy:řez 05:1' && stav.pocty[label] === 1) return stub(label, { stav: 'failed', infra: false, duvod: 'krok 2 neprošel', kroky_po_nasazeni: [{ id: 2, krok: 'OVERENI-87b purge', stav: 'selhalo', duvod: '403' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    k.nic(/^implement:řez 05:2$/, 'dorovnání (pokus 2) nepouští implementaci')
    k.pocet(/^verify:/, 1, 'brána jen v pokusu 1')
    k.obsahuje(k.s(/^deploy:řez 05:1$/).length ? volani.filter(x => x.label === 'deploy:řez 05:1')[1] : null, 'Dorovnání:', 'zadání dorovnání')
    return k.chyby
  },
}
