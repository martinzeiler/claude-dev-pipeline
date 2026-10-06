// 94 · stavba · 1.6.0 (spec § 1.5): refresh běží i bez prd_stale, když blok PRD vrátil blokující nálezy delty (běh web-rijen: 3 blokující
// šly jen implementaci), a jmenuje je zvlášť od ostatních. Hypotézy overit_prvni dostane část s jejich kritériem, zbytek kontrakt.
import { argsStavby, casti, kontrola, CWD } from '../stuby.mjs'

export default {
  nazev: 'refresh bez prd_stale, hypotézy ověřit jako první',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, hypotezy: {
    report: `${CWD}/docs/reviews/rez-05-prd-check-kolo-2.md`, ids: ['K2/N1-94', 'N4-94'], blokujici: ['K2/N1-94'],
    overit_prvni: [{ id: 'N7-94', kriterium: 'AK-K2', hypoteza: 'HYP-94A predikát měřidla nad prototypem' }, { id: 'N8-94', kriterium: 'AK99', hypoteza: 'HYP-94B sdílený typ' }],
  } }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const r = k.jeden('prd-refresh:řez 05')
    k.obsahuje(r, 'blokující K2/N1-94 jako první', 'blokující zvlášť')
    k.obsahuje(r, 'ostatní (formulace a zbytek) N4-94', 'ostatní nálezy')
    k.obsahuje(r, 'jiná kritéria nekontroluj', 'refresh jen nad blokujícími bez prd_stale')
    const k2 = k.jeden('implement:řez 05:část K2:1'), k1 = k.jeden('implement:řez 05:část K1:1'), kt = k.jeden('implement:řez 05:kontrakt:1')
    k.obsahuje(k2, 'HYP-94A', 'hypotézu ke kritériu části'); k.obsahuje(k2, 'ověř jako první, než začneš stavět', 'pokyn ověřit jako první')
    k.neobsahuje(k1, 'HYP-94A', 'cizí hypotézu')
    k.obsahuje(kt, 'HYP-94B', 'hypotézu bez části')
    return k.chyby
  },
}
