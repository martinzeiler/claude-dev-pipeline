// 93 · stavba · 1.6.0 (spec § 1.4): výsledek stavby s 10 částmi je pod 6 000 znaků. Seznamy, které uzavření zapsalo do
// docs/.vysledek-stavba-NN.json, jdou jen počtem (běh web-rijen: runtime usekl 15 z 25 výsledků na ~8 k a orchestrátor je dočítal).
import { argsStavby, casti, kontrola, stub, parsujLabel, CWD } from '../stuby.mjs'

const IDS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10']
const dlouhe = (p, n) => Array.from({ length: n }, (_, i) => `${p}-${i} ${'x'.repeat(120)}`)

export default {
  nazev: 'výsledek stavby s 10 částmi pod 6 000 znaků',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti(IDS.map(id => [id])), kontrakt_potreba: true, kriteria: 40 }),
  odpoved(label) {
    const l = parsujLabel(label)
    if (l.typ === 'implement') return stub(label, { follow_ups: dlouhe(`FU-93-${l.cast || l.role}`, 3), odchylky_od_prd: dlouhe(`ODCH-93-${l.cast || l.role}`, 2) })
    if (label === 'verify:řez 05:1') return null
    if (label === 'uzavření:řez 05') return stub(label, { vysledek_soubor: `${CWD}/docs/.vysledek-stavba-05.json` })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', seznamy_zapsane: true, vysledek_soubor: `${CWD}/docs/.vysledek-stavba-05.json` })
    const n = JSON.stringify(v || {}).length
    k.ok(n < 6000, `výsledek má ${n} znaků`)
    k.ok(v && !('reports' in v) && !('odmitnute' in v) && !('meridla' in v) && !('nasazeni' in v) && v.reports_pocet > 0 && v.nasazeni_pocet === 1, `seznamy jen počtem: ${JSON.stringify(v && Object.keys(v))}`)
    const c = k.jeden('uzavření:řez 05')
    k.obsahuje(c, `${CWD}/docs/.vysledek-stavba-05.json`, 'soubor výsledku')
    k.obsahuje(c, '"nasazeni":[', 'historii nasazení pro soubor výsledku')
    k.pole(c, ['vysledek_soubor'], 'CLOSE')
    return k.chyby
  },
}
