// 109 · PRD · 1.6.0 texty zadání a relativní předávka (spec 1.6.0 § 1.1, 1.2, 1.8, 1.10; rozbor-prd návrhy 1–4, 6, 7, 10, 12):
// mez malého řezu 2 000, odhad s přesuny dvakrát, Kontrakt se stropem, kostra dřív, přílohy grepem, číslované kroky, populace
// dotazem, protějšek, rozpor kritérií, A/B práh, prototyp, overit_prvni, zapracování nejmenší změnou se značkou „neověřeno“,
// čekání bez Monitoru. Autor části vrátí relativní cestu předávky: nástupce ji dostane absolutně.
import { argsPrd, kontrola, rozhrani, stub, CWD } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

export default {
  nazev: 'PRD: texty zadání 1.6.0 a relativní předávka',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 10, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true })
    if (label === 'prd-část:řez 05:K1') return stub(label, { predavka: 'docs/reviews/predavka-a109.md' })
    if (label === 'prd-check:řez 05:1') return { verdikt: 'needs-fixes', nalezu: 2, blokujicich: 2, osy: ['C'], report_path: `${CWD}/docs/reviews/rez-05-prd-check-kolo-1.md`, nalezy_ids: ['N1', 'N2'] }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const n2 = k.jeden('prd-část:řez 05:K1:n2')
    k.obsahuje(n2, `předávku ${CWD}/docs/reviews/predavka-a109.md`, 'absolutní cestu relativní předávky')
    const ar = k.jeden('prd:řez 05')
    for (const t of ['Řez do ~2 k řádků je malý', 'přesun a rozdělení souboru počítej dvakrát', 'kontrakt_odhad_radku', 'hned po rozdělení zapiš osnovu kostry',
      'přílohy vize (docs/vize/<slug>/) čti jen grepem', 'číslovaný seznam', 'Populaci nad daty, která řez', 'Kontrolní protějšek na předchozím nasazení', 'A/B proti předchozímu stavu', 'prototypem nad dnešním stavem', 'sdíleného backendu přepíše', 'doba_min', 'bez_soubehu']) k.obsahuje(ar, t)
    k.neobsahuje(ar, '1,2–2× naivního odhadu', 'starý odhad'); k.neobsahuje(ar, 'Řez do ~1,5 k', 'starou mez malého řezu')
    const ks = k.jeden('prd-check:řez 05:1')
    for (const t of ['protějšek měří nový svět', 'nečíslovaný krok je nález', 'dvě kritéria, která nejde splnit současně', 'overit_prvni', 'populace zadaná počtem nebo výčtem bez dotazu', 'populace do ~20 položek']) k.obsahuje(ks, t)
    const fk = k.jeden('prd-fix:řez 05')
    for (const t of ['Oprav nejmenší změnou', 'se značkou „nové“', 'neověřeno: <proč>', 'sekci nepřepisuj skriptem celou', 'číslovaný seznam']) k.obsahuje(fk, t)
    k.obsahuje(k.jeden('prd-check:řez 05:2'), 'značkou „neověřeno“', 'delta bere neověřená místa jako hypotézy')
    for (const x of volani) {
      k.obsahuje(x, 'run_in_background', 'čekání smyčkou (§ 1.10)'); k.neobsahuje(x, 'přes `Monitor`', 'radu čekat přes Monitor')
      const d = String(x.schema && x.schema.properties && x.schema.properties.predavka && x.schema.properties.predavka.description)
      k.ok(d.includes(`${CWD}/docs/reviews/predavka-`), `${x.label}: popis pole predavka bez absolutní cesty`)
    }
    rozhrani(k, volani)
    return k.chyby
  },
}
