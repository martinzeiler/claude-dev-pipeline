// 05 · stavba · část K2 selže v pokusu 1 (§ 3 Stav částí napříč pokusy): K3 čekající na K2 se nespustí, pokus končí před integrací;
// pokus 2 pustí jen K2 (s vlastním selháním v zadání) a K3, ne hotovou K1 ani kontrakt, integrace běží znovu.
// Výklad: review v pokusu 2 zahrne i K1 (hotová, dosud nezrevidovaná), jinak by ji review nikdy neviděl; proto pole zrevidovano.
import { argsStavby, casti, kontrola, stub, souboryCasti } from '../stuby.mjs'

const C = casti([['K1'], ['K2'], ['K3', ['K2']]])

export default {
  nazev: 'část K2 selže v pokusu 1',
  blok: 'blok-stavby',
  args: argsStavby({ casti: C, kontrakt_potreba: true }),
  odpoved(label) {
    if (label === 'implement:řez 05:část K2:1') return stub(label, { stav: 'selhalo', souhrn: 'SELHANI-K2: migrace tabulky rozpocty padá na cizím klíči', typecheck: false, testy_zelene: false, soubory: souboryCasti('K2') })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    if (v) k.rovno((v.casti || []).map(c => [c.id, c.hotovo]), [['K1', true], ['K2', true], ['K3', true]], 'návrat.casti')

    k.jeden('implement:řez 05:kontrakt:1'); k.nic(/^implement:řez 05:kontrakt:[2-9]/, 'kontrakt se neopakuje')
    k.jeden('implement:řez 05:část K1:1'); k.jeden('implement:řez 05:část K2:1')
    k.nic(/^implement:řez 05:část K3:1/, 'K3 čeká na selhanou K2')
    k.nic(/^implement:řez 05:integrace:1/, 'integrace po nedokončených částech')
    k.nic(/^implement:řez 05:část K1:[2-9]/, 'hotová část K1 v dalším pokusu')
    k.nic(/^implement:řez 05:oprava:/, 'oprava po selhání v implementaci (oprava jen po selhání mimo implementaci)')
    k.nic(/^diagnose:/, 'diagnóza po jednom neúspěchu')
    const k2 = k.jeden('implement:řez 05:část K2:2'), k3 = k.jeden('implement:řez 05:část K3:2'), inte = k.jeden('implement:řez 05:integrace:2')
    k.pred(k2, k3); k.pred(k3, inte)
    k.obsahuje(k2, 'SELHANI-K2', 'vlastní selhání části z pokusu 1')

    // Výklad (viz hlavička): všechny tři části projdou review právě jednou.
    for (const id of ['K1', 'K2', 'K3']) k.pocet(new RegExp(`^review:řez 05:část ${id}:1$`), 1, `review části ${id}`)
    k.jeden('review:řez 05:integrace:1')
    return k.chyby
  },
}
