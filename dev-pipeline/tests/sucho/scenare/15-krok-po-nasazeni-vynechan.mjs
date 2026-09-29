// 15 · stavba · deploy vrátí krok po nasazení se stavem vynechano (§ 3 Deploy): selhání deploye, E2E se nekoná, pokus 2
// dostane detail a jeho deploy příčinu předchozího selhání (bod 16).
import { argsStavby, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'vynechaný krok po nasazení je selhání deploye',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, prompt, opts, stav) {
    if (label === 'deploy:řez 05:1' && stav.pocty[label] === 1) return stub(label, { kroky_po_nasazeni: [
      { krok: 'reseed POST /api/seed', stav: 'provedeno', duvod: '' },
      { krok: 'PREPNOUT-PRIZNAK rozpocty_v2', stav: 'vynechano', duvod: 'chybí oprávnění k příznakům' },
    ] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    const deploy = volani.filter(x => /^deploy:/.test(x.label))
    const d1 = deploy[0], i2 = k.jeden('implement:řez 05:2')
    k.ok(!!d1, 'chybí deploy')
    k.pred(d1, i2)
    if (d1 && i2) k.ok(!volani.some(x => /^(e2e|kriteria):/.test(x.label) && x.start > d1.start && x.start < i2.start), 'E2E po deployi s vynechaným krokem')
    k.obsahuje(i2, 'PREPNOUT-PRIZNAK', 'vynechaný krok z pokusu 1')
    const d2 = i2 && deploy.find(x => x.start > i2.start)
    k.ok(!i2 || d2, 'pokus 2 bez deploye')
    k.obsahuje(d2, 'PREPNOUT-PRIZNAK', 'příčinu selhání deploye pokusu 1 (bod 16)')
    return k.chyby
  },
}
