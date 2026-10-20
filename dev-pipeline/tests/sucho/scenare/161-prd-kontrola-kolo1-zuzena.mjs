// 161 · PRD · 1.8.0 zúžená kontrola kola 1 (spec 1.8.0 § 2.11, experiment): kolo 1 jen osy ověřitelné proti kódu a prostředí
// (B, C, spor bez citace vize, doklad bez sekce, dělení částí), návrat jen BLOKUJE a OVĚŘIT PRVNÍ, formulace se nevrací,
// u blokujícího nálezu navržené znění; osy úplnosti, rozsahu a optimality patří refreshi. Kontrola čte standardy pluginu
// (§ 2.14) a kritérium nad sítí bez stanoviště nebo zápis bez Povolení je BLOKUJE (§ 2.5).
import { argsPrd, kontrola, rozhrani, stub, PLUGIN } from '../stuby.mjs'
import { CASTI3 } from './17-prd-tri-casti.mjs'

export default {
  nazev: 'PRD: kontrola kola 1 jen proti kódu a prostředí',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { kriteria: 14, casti: CASTI3, odhad_radku: 3500, kontrakt_potreba: true })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const ks = k.jeden('prd-check:řez 05:1')
    for (const t of ['Kolo 1 kontroluje jen to, co jde ověřit proti kódu a prostředí', 'Vracíš jen BLOKUJE a OVĚŘIT PRVNÍ; formulační a stylové nálezy nepiš ani do reportu',
      'U každého BLOKUJE napiš do reportu navržené znění', 'Osy úplnosti vůči vizi, rozsahu a optimality v kole 1 nekontroluj (patří refreshi ve stavbě)',
      'Spor nebo předpoklad (Odchylky, Rizika, záznam vize-spory, který PRD jmenuje) bez citace řádku vize', 'doklad_pred: true bez sekce „Doklad před nasazením“ s dotazy je BLOKUJE',
      'bez stanoviště jiného než stroj běhu nebo bez tolerance je BLOKUJE', 'zapisuje do živého systému bez doslova citovaného Povolení, je BLOKUJE',
      `Standardy pro review: ${PLUGIN}/standardy/SLOVNIK-NAVRHU.md a ${PLUGIN}/standardy/STANDARD-REVIEW.md, plus CODING_STANDARDS.md projektu`,
      'žádný soubor ve dvou částech', 'bez cyklu', 'posuň rozhraní do Kontraktu', 'každá nese počet kritérií, odhad minut, bez_soubehu a oblasti']) k.obsahuje(ks, t)
    for (const t of ['Kontroluj osy A (úplnost', 'D (rozsah řezu) a E (optimalita', 'odhad architekta bývá polovina skutečnosti', 'FORMULACE']) k.neobsahuje(ks, t, `staré znění kontroly: ${t}`)
    k.pole(ks, ['regrese', 'overit_prvni', 'nalezy_ids'], 'CHECK_SCHEMA')
    const kc = k.jeden('prd-check:řez 05:část K1:1')
    for (const t of ['Osy úplnosti, rozsahu a optimality nekontroluj (patří refreshi ve stavbě)', 'Vracíš jen BLOKUJE a OVĚŘIT PRVNÍ', `${PLUGIN}/standardy/STANDARD-REVIEW.md`]) k.obsahuje(kc, t)
    k.neobsahuje(kc, 'Osy A, D a E nekontroluj, patří kontrole kostry', 'staré znění kontroly části')
    rozhrani(k, volani)
    return k.chyby
  },
}
