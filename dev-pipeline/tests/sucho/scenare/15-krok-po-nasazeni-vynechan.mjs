// 15 · stavba · deploy vrátí krok po nasazení se stavem vynechano (§ 3 Deploy): selhání deploye, E2E se nekoná. Malý řez od 1.6.0
// v pokusu 2 jen dorovná deploy se stejným stromem (běh web-rijen: řez 2 opakoval celý pokus) a deploy dostane příčinu selhání
// (bod 16) i krok, který nasazení 1 provedlo, ačkoli jako celek selhalo.
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'vynechaný krok po nasazení: selhání deploye a dorovnání',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, prompt, opts, stav) {
    if (label === 'deploy:řez 05:1' && stav.pocty[label] === 1) return stub(label, { kroky_po_nasazeni: [
      { id: 1, krok: 'reseed POST /api/seed', stav: 'provedeno', duvod: '' },
      { id: 2, krok: 'PREPNOUT-PRIZNAK rozpocty_v2', stav: 'vynechano', duvod: 'chybí oprávnění k příznakům' },
    ] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    const deploy = volani.filter(x => /^deploy:/.test(x.label))
    const [d1, d2] = deploy
    k.ok(!!d1 && !!d2, `čekána dvě nasazení, jsou ${deploy.length}`)
    k.nic(/^implement:řez 05:2$/, 'dorovnání deploye nepouští implementaci')
    k.pocet(/^verify:/, 1, 'dorovnání bránu znovu nepouští')
    k.pocet(/^review:/, 1, 'dorovnání review znovu nepouští')
    if (d1 && d2) k.ok(!volani.some(x => /^(e2e|kriteria):/.test(x.label) && x.start > d1.start && x.start < d2.start), 'E2E po deployi s vynechaným krokem')
    k.obsahuje(d2, 'PREPNOUT-PRIZNAK', 'příčinu selhání deploye pokusu 1 (bod 16)')
    k.obsahuje(d2, 'Dorovnání', 'pokyn k dorovnání')
    k.obsahuje(d2, 'Předchozí nasazení tohoto řezu už provedlo: 1. reseed POST /api/seed', 'krok provedený v nasazení, které jako celek selhalo')
    return k.chyby
  },
}
