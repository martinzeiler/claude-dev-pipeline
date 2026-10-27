// 167 · PRD · 1.8.0 texty zadání (spec 1.8.0 § 2.1, 2.2, 2.5, 2.11, 2.14, 2.16): rámec nese vize-spory s citací řádku vize
// a definici konzervativní volby odkazem na TVAR-DOKUMENTU.md (žádné „rozhodni konzervativně“, žádný KONTRAKT.md); architekt
// dostane model měření nad sítí (N běhů střídavě, stanoviště, tolerance, prostředí), gitignorovaný adresář surových dat,
// násobek odhadu (od 1.9.0 2×), osnovu kostry před čtením kódu částí a pokyn nečíst standardy pro review; prostredi z architekta jde orchestrátorovi.
import { argsPrd, kontrola, rozhrani, stub, PLUGIN } from '../stuby.mjs'

const PROSTREDI = [{ kriterium: 'AK3 Rychlost první odpovědi', duvod: 'projekt nemá měřicí stanoviště mimo stroj běhu' }]

export default {
  nazev: 'PRD: texty zadání 1.8.0',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved(label) {
    if (label === 'prd:řez 05') return stub(label, { prostredi: PROSTREDI })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, prostredi: PROSTREDI })
    for (const x of volani) {
      k.obsahuje(x, 'zapiš do docs/vize-spory.md s citací řádku vize', 'spor s citací (§ 2.1)')
      k.obsahuje(x, `tvar a definice konzervativní volby: ${PLUGIN}/skills/orchestrate/TVAR-DOKUMENTU.md, sekce Vize-spory`, 'definice konzervativní volby odkazem')
      k.obsahuje(x, 'obsahová, právní a etická rozhodnutí nejsou tvoje: udělej, co vize říká, riziko zapiš jako otázku s návrhem „ponechat“', 'rozhodovací právo majitele')
      k.obsahuje(x, 'Pravidla dokumentů nečti celá', 'pravidla dokumentů po sekcích')
      k.neobsahuje(x, 'rozhodni konzervativně', 'staré „rozhodni konzervativně“')
      k.neobsahuje(x, 'KONTRAKT.md', 'KONTRAKT.md v zadání agenta')
      k.neobsahuje(x, 'cache agenta žije 5 minut', 'věta o cache agenta')
    }
    const ar = k.jeden('prd:řez 05')
    for (const t of ['N běhů (nejméně 3) střídavě se základem ve stejné chvíli a ze stejného místa', 'měřicí stanoviště jiné než stroj, na kterém běh běží', 'medián kandidáta proti mediánu základu v toleranci',
      'označ ho „prostředí“ a vrať v prostredi', 'gitignorovaného docs/e2e/rez-NN-vykon/', 'skutečnost bývá 2× tvůj odhad', 'zapiš osnovu kostry (nadpisy, tabulka Části s odhady, Kontrakt, kritéria) dřív, než začneš číst kód částí',
      'Standardy pro review (standardy/ pluginu, CODING_STANDARDS.md projektu) nečteš: řídíš se CLAUDE.md projektu', 'Čekání na čas (pravidlo v sekci Čekání na čas pravidel dokumentů běhu)']) k.obsahuje(ar, t)
    k.neobsahuje(ar, 'Na organický čas běh čeká jen tam, kde to vize výslovně vede jako rozhodnutí majitele s odhadem, o kolik hodin se běh prodlouží', 'sdílený odstavec čekání opsaný celý')
    const ks = k.jeden('prd-check:řez 05:1')
    k.neobsahuje(ks, 'Na organický čas běh čeká jen tam, kde to vize výslovně vede jako rozhodnutí majitele s odhadem, o kolik hodin se běh prodlouží', 'sdílený odstavec čekání opsaný celý v kontrole')
    k.obsahuje(ks, 'kritérium, které má měřit z tohoto stroje proti produkci, má být vedené jako „prostředí“', 'prostředí v kontrole')
    rozhrani(k, volani)
    return k.chyby
  },
}
