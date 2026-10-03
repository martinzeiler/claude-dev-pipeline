// 84 · PRD · 1.5.0 texty zadání (spec 1.5.0 § 1.1, 1.2, 1.7, 1.14): čekání nejvýš 4,5 minuty v rámci, měřidla nad populací
// s odhadem doby (architekt i kontrola), části ~600–1 500 řádků včetně fixtur a měřidel, kontrola části posuzuje Kontrakt jen
// v tom, co část používá, zapracování bere návrh z reportu jako hypotézu a edituje místa, popis pole predavka.
import { argsPrd, kontrola, rozhrani, stub, CWD, S } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

export default {
  nazev: 'PRD: texty zadání 1.5.0',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    if (label === 'prd-check:řez 05:část K1:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['B'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-cast-K1-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    for (const x of volani) {
      k.obsahuje(x, 'Jedno čekací volání trvá nejvýš 4,5 minuty', 'pravidlo čekání (§ 1.1)')
      k.neobsahuje(x, 'skončí sama do 10 minut', 'staré pravidlo čekání')
      const d = S(x.schema && x.schema.properties && x.schema.properties.predavka && x.schema.properties.predavka.description)
      k.ok(d.includes('TVÉ předávce') && d.includes('předchůdce sem nikdy nevracej'), `${x.label}: popis pole predavka (§ 1.7): ${d.slice(0, 80)}`)
    }
    const ar = k.jeden('prd:řez 05')
    k.obsahuje(ar, 'počet položek × čas na položku', 'odhad doby měřidla nad populací (§ 1.2)')
    k.obsahuje(ar, 'část pod ~600 řádků nezakládej'); k.obsahuje(ar, 'včetně testů, fixtur a měřidel')
    const ks = k.jeden('prd-check:řez 05:1')
    k.obsahuje(ks, 'počet položek × čas na položku', 'měřidlo nad populací jako nález kontroly'); k.obsahuje(ks, '~600–1 500 změněných řádků')
    k.obsahuje(k.jeden('prd-check:řez 05:část K1:1'), 'Kontrakt a tabulku Části posuzuj jen v tom, co tvoje část z Kontraktu používá')
    for (const f of [k.jeden('prd-fix:řez 05'), k.jeden('prd-fix:řez 05:část K1')]) {
      k.obsahuje(f, 'Návrh v reportu je hypotéza stejně jako nález'); k.obsahuje(f, 'soubor nepřepisuj celý (Write)')
    }
    rozhrani(k, volani)
    return k.chyby
  },
}
