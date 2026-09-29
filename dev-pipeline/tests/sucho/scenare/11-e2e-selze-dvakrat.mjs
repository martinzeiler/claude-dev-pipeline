// 11 · stavba · řez s částmi selže v E2E v pokusu 1 i 2 (§ 3 Pokusy, Implementace, Deploy bod 16): diagnóza jen před pokusem 3,
// pokusy 2 a 3 jdou přes implement:…:oprava:P (s detailem selhání, v pokusu 3 i s diagnózou), ne přes části, kontrakt ani integraci;
// hotové části se znovu nerevidují, review dostane opravu; deploy pokusu 2 a 3 nese příčinu předchozího selhání.
import { argsStavby, casti, kontrola, parsujLabel, pokusZ, e2ePass } from '../stuby.mjs'

const C = casti([['K1'], ['K2']])
const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK7-SELHANI: uložení rozpočtu vrací 500'] })

export default {
  nazev: 'selhání v E2E v pokusech 1 a 2',
  blok: 'blok-stavby',
  args: argsStavby({ casti: C, kontrakt_potreba: true }),
  odpoved(label, prompt, opts, stav) {
    const l = parsujLabel(label)
    if (l.typ === 'e2e' && pokusZ(stav) < 3) return FAIL
    if (l.typ === 'diagnose') return { pricina: 'PRICINA-DIAG: apps/sucho/rozpocet.ts uloz neošetří null', doporuceni: 'ošetřit null na vstupu', smycka_postavena: true }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 3 })
    k.pocet(/^diagnose:/, 1, 'jedna diagnóza')
    const di = k.jeden('diagnose:řez 05'), o2 = k.jeden('implement:řez 05:oprava:2'), o3 = k.jeden('implement:řez 05:oprava:3')
    k.pred(o2, di); k.pred(di, o3)
    k.nic(/^implement:řez 05:oprava:1/, 'oprava v pokusu 1')
    k.nic(/^implement:řez 05:(část [^:]+|kontrakt|integrace):[2-9]/, 'pokus 2 a 3 přes části, kontrakt nebo integraci')
    k.nic(/^implement:řez 05:[2-9]$/, 'pokus přes implementaci malého řezu')
    k.agent(o2, 'dev-pipeline:implement', 'opus', 'high')
    k.obsahuje(o2, 'AK7-SELHANI', 'detail selhání pokusu 1')
    k.obsahuje(o3, 'PRICINA-DIAG', 'diagnózu')

    const ro2 = k.jeden('review:řez 05:oprava:2'), ro3 = k.jeden('review:řez 05:oprava:3')
    k.pred(o2, ro2); k.pred(o3, ro3)
    k.obsahuje(ro2, 'apps/sucho/oprava.ts: opravPricinu', 'změněná místa opravy')
    for (const id of ['K1', 'K2']) k.pocet(new RegExp(`^review:řez 05:část ${id}:1$`), 1, `review části ${id} jen jednou`)

    // Bod 16: první deploy po opravě nese příčinu předchozího selhání (a v pokusu 3 diagnózu).
    const deploy = volani.filter(x => /^deploy:/.test(x.label))
    const d2 = o2 && deploy.find(x => x.start > o2.start), d3 = o3 && deploy.find(x => x.start > o3.start)
    k.ok(!o2 || d2, 'pokus 2 bez deploye'); k.ok(!o3 || d3, 'pokus 3 bez deploye')
    k.obsahuje(d2, 'AK7-SELHANI', 'příčinu selhání pokusu 1 (bod 16)')
    k.obsahuje(d3, 'PRICINA-DIAG', 'diagnózu (bod 16)')
    return k.chyby
  },
}
