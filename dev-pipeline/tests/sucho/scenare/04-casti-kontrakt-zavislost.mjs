// 04 · stavba · řez se 4 částmi, K3 závisí na K1, kontrakt (§ 3 Implementace a Review): kontrakt před částmi, vlna K1 ∥ K2 ∥ K4,
// K3 až po K1, integrace (opus medium) po všech, review po částech ∥ integrační review, žádná oprava ani review celého řezu.
import { argsStavby, casti, kontrola, souboryCasti, prdCasti, rozhrani } from '../stuby.mjs'

const C = casti([['K1'], ['K2'], ['K3', ['K1']], ['K4']])
const IDS = C.map(c => c.id)
const A = argsStavby({ casti: C, kontrakt_potreba: true })

export default {
  nazev: '4 části, K3 závisí na K1, kontrakt',
  blok: 'blok-stavby',
  args: A,
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1, predavky: 0 })
    if (v) k.rovno((v.casti || []).map(c => [c.id, c.hotovo]), IDS.map(id => [id, true]), 'návrat.casti')

    const ko = k.jeden('implement:řez 05:kontrakt:1')
    const p = Object.fromEntries(IDS.map(id => [id, k.jeden(`implement:řez 05:část ${id}:1`)]))
    const inte = k.jeden('implement:řez 05:integrace:1')
    k.pocet(/^implement:řez 05:část /, 4, 'každá část jednou')
    k.nic(/^implement:řez 05:(\d+|oprava:\d+)$/, 'řez s částmi bez opravy a bez implementace malého řezu')
    for (const id of IDS) { k.pred(ko, p[id]); k.pred(p[id], inte) }
    k.vsechnySoubezne([p.K1, p.K2, p.K4], 'nezávislé části K1, K2, K4')
    k.pred(p.K1, p.K3)
    k.agent(ko, 'dev-pipeline:implement', 'opus', 'high')
    for (const id of IDS) k.agent(p[id], 'dev-pipeline:implement', 'opus', 'high')
    k.agent(inte, 'dev-pipeline:implement', 'opus', 'medium')
    k.pole(p.K1, ['soubory', 'mimo_hranici', 'zmenena_mista', 'predavka'], 'IMPL')

    k.obsahuje(ko, 'neimplementováno', 'těla částí jako „neimplementováno“')
    for (const id of IDS) {
      k.obsahuje(p[id], prdCasti(id), `PRD části ${id}`)
      k.obsahuje(p[id], `apps/sucho/${id.toLowerCase()}/**`, `hranici souborů části ${id}`)
      k.obsahuje(p[id], A.prd_path, 'kostru PRD')
      k.obsahuje(p[id], 'mimo_hranici')
    }
    k.obsahuje(inte, 'neimplementováno', 'odstranění zbylých „neimplementováno“')

    // Review po částech: rozsah jen soubory části (výsledek soubory), souběžně s integračním review.
    const rc = IDS.map(id => k.jeden(`review:řez 05:část ${id}:1`)), tc = IDS.map(id => k.jeden(`thermo:řez 05:část ${id}`))
    const ri = k.jeden('review:řez 05:integrace:1')
    k.vsechnySoubezne([...rc, ...tc, ri], 'review po částech a integrační review')
    for (const x of [...rc, ...tc, ri]) k.pred(inte, x)
    k.nic(/^(thermo:řez 05|review:řez 05:1)$/, 'review celého řezu u řezu s částmi')
    IDS.forEach((id, i) => {
      const cizi = IDS.find(x => x !== id)
      k.obsahuje(rc[i], souboryCasti(id)[0], `soubory části ${id}`); k.neobsahuje(rc[i], souboryCasti(cizi)[0], `soubory cizí části ${cizi}`)
      k.obsahuje(rc[i], `code-review-cast-${id}`, 'report review části')
      k.obsahuje(tc[i], souboryCasti(id)[0], `soubory části ${id}`); k.obsahuje(tc[i], `thermo-cast-${id}`, 'report thermo části')
    })
    k.obsahuje(ri, 'packages/kontrakt/typy.ts', 'soubory kontraktu'); k.obsahuje(ri, 'apps/sucho/registrace.ts', 'soubory integrace')
    k.obsahuje(ri, 'code-review-integrace', 'report integračního review')

    // Brána dostane cesty PRD částí (§ 3 Brána).
    const ve = k.jeden('verify:řez 05:1')
    for (const id of IDS) k.obsahuje(ve, prdCasti(id), `PRD části ${id} pro měřidla`)
    rozhrani(k, volani)
    return k.chyby
  },
}
