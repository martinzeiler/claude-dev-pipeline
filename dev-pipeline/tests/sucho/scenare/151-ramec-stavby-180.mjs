// 151 · stavba · 1.8.0 (spec § 2.1, § 2.14, § 2.17, § 3 A1): rámec každého agenta nese pět vět (autonomie, vize-spory s definicí konzervativní
// volby odkazem, návrat strojově, společná pravidla odkazem na TVAR-DOKUMENTU.md, hranice); nic z toho, co šlo do TVAR-DOKUMENTU
// (čekání na proces, pojmenování souborů), ani „rozhodni konzervativně“ a KONTRAKT.md. Standardy pro review dostanou jen reviewer,
// thermo a fix, implementace ne.
import { argsStavby, kontrola, rozhrani, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'stavba: rámec 1.8.0 a standardy jen pro review',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const bez = (co, f) => { const xs = volani.filter(f).map(x => x.label); k.ok(!xs.length, `${co}: ${xs.join(', ')}`) }
    bez('zadání s „rozhodni konzervativně“', x => /rozhodni konzervativně/.test(x.prompt))
    bez('zadání s KONTRAKT.md', x => /KONTRAKT\.md/.test(x.prompt))
    bez('zadání s čekací smyčkou nebo Monitorem', x => /run_in_background|seq 1 26|Monitor/.test(x.prompt))
    bez('zadání s pojmenováním souborů (patří do TVAR-DOKUMENTU)', x => /summary, findings, analysis/.test(x.prompt))
    bez('zadání s „Nespouštěj review, deploy ani E2E“', x => /Nespouštěj review, deploy ani E2E/.test(x.prompt))
    bez('rámec bez věty o hranici', x => !/^Hranice: měníš jen soubory své role/m.test(x.prompt))
    bez('rámec bez definice konzervativní volby odkazem', x => !x.prompt.includes(`definici konzervativní volby má ${PLUGIN}/skills/orchestrate/TVAR-DOKUMENTU.md, sekce Vize-spory`))
    for (const l of ['review:řez 05:1', 'thermo:řez 05']) k.obsahuje(k.jeden(l), `${PLUGIN}/standardy/`, 'standardy pro review')
    k.neobsahuje(k.jeden('implement:řez 05:1'), 'standardy/', 'standardy v implementaci (patří reviewerovi)')
    rozhrani(k, volani)
    return k.chyby
  },
}
