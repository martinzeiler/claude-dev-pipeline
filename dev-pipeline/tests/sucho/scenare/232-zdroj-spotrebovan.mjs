// 232 · stavba · 1.11.0 (spec I3; řez 11): zadání E2E rozlišuje vadné kritérium „zdroj spotřebován vlastní chybou“ od chybějícího credentialu.
// 1.12.0 (spec K3): druh platí jen pro neobnovitelný zdroj (jednorázový souhlas); vyčerpaná denní kvóta se druhý den obnoví a patří do k_domereni.
import { argsStavby, kontrola } from '../stuby.mjs'

export default {
  nazev: 'druh vadného kritéria: zdroj spotřebován vlastní chybou',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    const e = k.jeden('e2e:řez 05:1')
    k.obsahuje(e, 'druh „zdroj spotřebován vlastní chybou“, credential nechybí', 'druh v zadání')
    k.ok(e && /zdroj spotřebován vlastní chybou/.test(e.schema.properties.vadna_kriteria.description), 'druh ve schématu')
    k.obsahuje(e, 'jeho neobnovitelný jednorázový zdroj spotřeboval dřívější krok běhu', 'jen neobnovitelný zdroj v zadání')
    k.obsahuje(e, 'zdroj, který se sám obnoví, sem nepatří', 'obnovitelný zdroj mimo druh')
    const popis = e ? e.schema.properties.vadna_kriteria.description : ''
    k.ok(/zdroj spotřebován vlastní chybou \(jen neobnovitelný zdroj: /.test(popis) && /vyčerpaná kvóta platformy patří do k_domereni/.test(popis), `popis druhu: ${popis}`)
    k.ok(/doklad jednoho z pěti druhů/.test(popis), 'druhů zůstává pět')
    return k.chyby
  },
}
