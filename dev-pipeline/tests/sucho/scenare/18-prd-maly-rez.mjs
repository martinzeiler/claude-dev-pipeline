// 18 · PRD · malý řez, architekt vrátí casti: [] (§ 1.6, § 2 Tok 1): žádní autoři, jedna kontrola jako dnes, návrat casti: [].
import { argsPrd, kontrola, rozhrani } from '../stuby.mjs'

export default {
  nazev: 'malý řez bez částí',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, casti: [], predavky: 0 })
    k.ok(!(v && v.kontrakt_potreba), 'návrat.kontrakt_potreba u malého řezu')
    const ar = k.jeden('prd:řez 05'), ks = k.jeden('prd-check:řez 05:1')
    k.pred(ar, ks)
    k.nic(/^prd-část:/, 'autor části u malého řezu')
    k.pocet(/^prd-check:/, 1, 'jediná kontrola')
    k.nic(/část/, 'volání nad částmi u malého řezu')
    for (const x of volani) k.ok(x.prompt.startsWith('Řez 05: blok PRD.'), `${x.label}: rámec nezačíná „Řez 05: blok PRD.“ (§ 1.8)`)
    k.obsahuje(ar, 'Vizi nečti celou', 'výřez vize (§ 2)')
    rozhrani(k, volani)
    return k.chyby
  },
}
