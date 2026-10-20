// 161b · PRD · 1.8.0 zúžená kontrola kola 1 u malého řezu (spec 1.8.0 § 2.11): osa B a C, bez úplnosti, rozsahu a optimality.
import { argsPrd, kontrola, rozhrani } from '../stuby.mjs'

export default {
  nazev: 'PRD: kontrola kola 1 malého řezu jen B a C',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const ks = k.jeden('prd-check:řez 05:1')
    for (const t of ['Kolo 1 kontroluje jen to, co jde ověřit proti kódu a prostředí: osa B technická validita proti skutečnému kódu', 'osa C měřitelnost a splnitelnost kritérií',
      'SPUSŤ teď nad dnešním stromem', 'Vracíš jen BLOKUJE a OVĚŘIT PRVNÍ']) k.obsahuje(ks, t)
    for (const t of ['Kontroluj úplnost vůči řádku plánu a bodům vize', 'kvalitu kritérií, rozsah řezu a to, že PRD nezavádí UI plochu']) k.neobsahuje(ks, t, `staré znění: ${t}`)
    rozhrani(k, volani)
    return k.chyby
  },
}
