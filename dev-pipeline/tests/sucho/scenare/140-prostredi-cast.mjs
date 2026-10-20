// 140 · stavba · 1.8.0 (spec § 2.2): část vrátí stav prostredi s důkazem: kód je odevzdaný, část je hotová, nestojí pokus ani nástupce
// ani diagnózu; části na ní závislé se nestaví (stejný důvod), ostatní doběhnou, integrace jen nad hotovými; řez se uzavře hotovo
// s otázkou pro majitele (rozhodnuti typ prostredi) a uzavření zapíše stav PROSTŘEDÍ.
import { argsStavby, casti, kontrola, stub } from '../stuby.mjs'

export default {
  nazev: 'část prostredi s důkazem: hotovo s otázkou, závislé části stojí',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2', ['K1']], ['K3']]) }),
  odpoved(label) {
    if (label === 'implement:řez 05:část K1:1') return stub(label, { stav: 'prostredi', dukaz: 'DUKAZ-140: curl měřicí služby vrací 503, tři pokusy po minutě', navrh: 'měřit z CI běžce' })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.nic(/^implement:řez 05:část K2/, 'K2 závisí na K1 zastavené prostředím, nestaví se')
    k.nic(/^implement:řez 05:část K1:1:n|^diagnose:/, 'prostředí nespouští nástupce ani diagnózu')
    k.jeden('implement:řez 05:část K3:1')
    k.obsahuje(k.jeden('implement:řez 05:integrace:1'), 'kromě částí K2', 'integrace jen nad hotovými, K2 zastavená')
    k.jeden('review:řez 05:část K1:1')
    k.rovno(v && v.casti, [{ id: 'K1', hotovo: true, prostredi: true }, { id: 'K2', hotovo: false, prostredi: true }, { id: 'K3', hotovo: true }], 'návrat.casti')
    const pr = (v && v.rozhodnuti || []).filter(x => x && typeof x === 'object' && x.typ === 'prostredi')
    k.ok(pr.length === 2 && pr[0].cast === 'část K1' && /DUKAZ-140/.test(pr[0].dukaz) && pr[1].cast === 'část K2' && /závisí na části K1/.test(pr[1].dukaz), `rozhodnuti typ prostredi pro K1 a K2: ${JSON.stringify(pr)}`)
    k.ok((v && v.prostredi || []).length === 2, 'návrat.prostredi nese obě položky')
    const uz = k.jeden('uzavření:řez 05')
    k.obsahuje(uz, 'PROSTŘEDÍ: <důkaz>', 'zápis stavu prostředí ke kritériím'); k.obsahuje(uz, 'DUKAZ-140', 'důkaz v zadání uzavření')
    k.ok(logy.some(l => /část K1: prostředí/.test(l)), 'log prostředí části')
    return k.chyby
  },
}
