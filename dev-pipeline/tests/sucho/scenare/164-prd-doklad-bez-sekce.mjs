// 164 · PRD · 1.8.0 doklad_pred: true bez sekce dokladu (spec 1.8.0 § 2.11, návrh 16): architekt vrátí doklad_pred bez popisu,
// kontrola je čistá, blok přesto pustí zapracování s vlastním nálezem (stavba by na dokladu bez sekce spálila pokus) a návrat
// nese popis dokladu ze zapracování. Kontrola kola 1 nese pravidlo, že doklad bez sekce je BLOKUJE.
// 1.12.0 (spec J2): doklad má jedno jméno souboru (rez-NN-doklad-pred.md); rez-NN-pred.md je výstup kroku před nasazením. Architekt to má
// v zadání a jiné jméno je v kontrole BLOKUJE (architekt řezu, jehož doklad vyrábí kód řezu, použil druhé jméno a deploy doklad nenašel).
import { argsPrd, kontrola, rozhrani, stub } from '../stuby.mjs'

export default {
  nazev: 'PRD: doklad_pred bez popisu jde zapracování jako nález bloku',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { doklad_pred: true, doklad_popis: '' })
    if (label === 'prd-fix:řez 05') return stub(label, { doklad_pred: true, doklad_popis: 'DOKLAD-164: počty řádků tabulky rozpočtů a vzorek 20 klíčů', zmenena_mista: ['Doklad před nasazením'] })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, doklad_pred: true, doklad_popis: 'DOKLAD-164: počty řádků tabulky rozpočtů a vzorek 20 klíčů' })
    const ks = k.jeden('prd-check:řez 05:1')
    k.obsahuje(ks, 'doklad_pred: true bez sekce „Doklad před nasazením“ s dotazy je BLOKUJE', 'pravidlo kontroly')
    k.obsahuje(ks, 'Doklad pod jiným jménem souboru než docs/e2e/rez-05-doklad-pred.md je BLOKUJE', 'jméno dokladu v kontrole')
    k.obsahuje(ks, 'docs/e2e/rez-05-pred.md je výstup kroku před nasazením, ne doklad', 'rozlišení dvou jmen v kontrole')
    const arch = k.jeden('prd:řez 05')
    k.obsahuje(arch, 'Doklad jde vždy do docs/e2e/rez-05-doklad-pred.md', 'jméno dokladu v zadání architekta')
    k.obsahuje(arch, 'docs/e2e/rez-05-pred.md je výstup kroku před nasazením, ne doklad', 'rozlišení dvou jmen v zadání architekta')
    const fk = k.jeden('prd-fix:řez 05')
    k.obsahuje(fk, 'Nález bloku: PRD vrací doklad_pred: true, ale nemá sekci „Doklad před nasazením“ s dotazy', 'nález bloku v zadání zapracování')
    k.ok(logy.some(l => l.includes('PRD vrací doklad_pred: true bez popisu dokladu; zapracování kostry s nálezem')), 'log nálezu bloku')
    k.nic(/^prd-check:řez 05:2$/, 'delta bez blokujících nálezů kola 1')
    k.ok(v && v.stavba && v.stavba.doklad_pred === true, 'stavba.doklad_pred')
    rozhrani(k, volani)
    return k.chyby
  },
}
