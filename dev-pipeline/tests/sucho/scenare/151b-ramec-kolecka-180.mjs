// 151b · kolečko · 1.8.0 (spec § 2.1, § 2.14, § 3 A1): rámec kolečka jako ve stavbě; deploy bez vlastní čekací smyčky a bez věty
// o nechávání cizích souborů (hranice je v rámci); standardy jen pro review, thermo a fix.
import { argsKolecko, kontrola, rozhrani, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'kolečko: rámec 1.8.0 a standardy jen pro review',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const bez = (co, f) => { const xs = volani.filter(f).map(x => x.label); k.ok(!xs.length, `${co}: ${xs.join(', ')}`) }
    bez('zadání s „rozhodni konzervativně“ nebo KONTRAKT.md', x => /rozhodni konzervativně|KONTRAKT\.md/.test(x.prompt))
    bez('zadání s čekací smyčkou nebo Monitorem', x => /run_in_background|seq 1 26|4,5 minuty|Monitor/.test(x.prompt))
    bez('zadání s „Necháváš na pokoji“', x => /Necháváš na pokoji/.test(x.prompt))
    bez('rámec bez věty o hranici', x => !/^Hranice: měníš jen soubory své role/m.test(x.prompt))
    for (const l of ['review:kolečko:1', 'thermo:kolečko', 'security:kolečko:čočka']) k.obsahuje(k.jeden(l), `${PLUGIN}/standardy/`, 'standardy pro review')
    k.neobsahuje(k.jeden('e2e-scénáře:kolečko'), 'standardy/', 'standardy mimo review')
    rozhrani(k, volani)
    return k.chyby
  },
}
