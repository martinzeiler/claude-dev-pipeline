// 226 · stavba · 1.11.0 (spec I1): kritérium, které čeká déle než ~30 min, se změří startem a průběhem a vrátí v k_domereni; řez se uzavře jako nejvýš
// pass-castecne a uvolní slot (řez 03 držel slot 4 h 33). Položka bez čtecí kontroly nebo platného času je FAIL. V kolečku se nepoužije.
// 1.12.0 (spec K3): do k_domereni patří i kritérium nad vyčerpanou kvótou platformy (nebo denní pojistkou starší vize, kterou majitel potvrdil
// jako mez): co_bezi = stav meze a co je změřené, kontrola = sekce a kroky scénáře k přeměření, nejdriv = začátek dalšího dne meze. Vadné
// kritérium to není (verifikátoři tak vrátili čtyři kritéria a z doměření vznikl mini-řez).
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const DOM = { kriterium: 'AK9 Noční běh', co_bezi: 'běh 123 od 02:00', kontrola: "psql -c 'select stav from behy'", nejdriv: '2026-11-08T06:00:00+01:00' }
const KVOTA = { kriterium: 'AK24 Provedení změny v účtu', co_bezi: 'denní kvóta platformy vyčerpaná ve 14:10 (38 provedení); změřeny kroky 1–3 z 5', kontrola: 'sekce S1, kroky 4 a 5', nejdriv: '2026-11-19T00:00:00+01:00' }

export default {
  nazev: 'doměření neblokuje uzavření řezu',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { k_domereni: [DOM] }) : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.rovno(v && v.e2e && v.e2e.vysledek, 'pass-castecne', 'nejvýš pass-castecne')
    k.rovno(v && v.k_domereni, [DOM], 'položka v návratu')
    k.obsahuje(k.jeden('e2e:řez 05:1'), 'vrať ho v k_domereni', 'pravidlo v zadání'); k.pole(k.jeden('e2e:řez 05:1'), ['k_domereni'], 'E2E')
    const u = k.jeden('uzavření:řez 05')
    k.obsahuje(u, 'K DOMĚŘENÍ', 'záznam v PRD a journalu'); k.obsahuje(u, '"k_domereni":[{"kriterium":"AK9 Noční běh"', 'položka v souboru výsledku')
    k.ok(logy.some(l => /1 kritérií k doměření, řez se uzavře a uvolní slot; ověří je orchestrátor od 2026-11-08T06:00:00\+01:00/.test(l)), 'log')
    const bez = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { k_domereni: [{ ...DOM, kontrola: '' }] }) : null })
    const m = kontrola(bez.volani)
    m.obsahuje(m.jeden('fix-e2e:řez 05:1'), 'AK9 Noční běh (doměření bez kontroly nebo platného času)', 'FAIL bez kontroly')
    const cas = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { k_domereni: [{ ...DOM, nejdriv: 'zítra ráno' }] }) : null })
    kontrola(cas.volani).jeden('fix-e2e:řez 05:1')
    k.ok(cas.volani.some(x => x.label === 'fix-e2e:řez 05:1'), 'FAIL bez platného času')
    const kl = await spust({ blok: 'blok-kolecko', args: { cwd: '/sucho/projekt', plugin_root: '/sucho/plugin', vize: '/sucho/projekt/docs/vize/sucho.md', base: 'main', deploy_mode: 'config' }, odpoved: () => null })
    const e = kl.volani.find(x => x.label === 'e2e:kolečko:1')
    k.ok(e && !e.klice.includes('k_domereni') && !e.prompt.includes('k_domereni'), 'kolečko doměření nepoužívá')
    k.chyby.push(...m.chyby)

    // Obnovitelná mez (spec K3): zadání a schéma ji vedou do k_domereni, ne do vadných kritérií.
    const e1 = k.jeden('e2e:řez 05:1')
    for (const t of ['jehož kvóta platformy (nebo denní pojistka starší vize, kterou majitel potvrdil jako mez) je dnes vyčerpaná', 'co_bezi = stav meze a co je změřené', 'kontrola = sekce a kroky scénáře k přeměření', 'nejdriv = začátek dalšího dne meze', 'ne ve vadna_kriteria']) k.obsahuje(e1, t)
    const kd = e1 && e1.schema.properties.k_domereni
    k.ok(kd && /kvóta platformy \(nebo denní pojistka starší vize, kterou majitel potvrdil jako mez\) je dnes vyčerpaná/.test(kd.description), `popis k_domereni: ${kd && kd.description}`)
    const pp = (kd && kd.items.properties) || {}
    k.ok(/stav meze a co je změřené/.test(pp.co_bezi && pp.co_bezi.description) && /sekce a kroky scénáře k přeměření/.test(pp.kontrola && pp.kontrola.description) && /začátek dalšího dne meze/.test(pp.nejdriv && pp.nejdriv.description), 'popisy polí položky pro vyčerpanou kvótu')
    // Kritérium nad vyčerpanou kvótou: řez se uzavře, položka jde orchestrátorovi k doměření, žádná otázka majiteli ani opravný cyklus.
    const kv = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { k_domereni: [KVOTA] }) : null })
    const q = kontrola(kv.volani)
    q.navrat(kv.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 1, k_domereni: [KVOTA], rozhodnuti: [] })
    q.rovno(kv.vysledek && kv.vysledek.e2e && [kv.vysledek.e2e.vysledek, kv.vysledek.e2e.vadna_kriteria], ['pass-castecne', []], 'kvóta není vadné kritérium')
    q.nic(/^(fix-e2e:|e2e:řez 05:2|implement:řez 05:2)/, 'opravný cyklus kvůli vyčerpané kvótě')
    q.obsahuje(q.jeden('uzavření:řez 05'), 'ověří orchestrátor od <nejdriv> příkazem <kontrola>', 'záznam k doměření'); q.obsahuje(q.jeden('uzavření:řez 05'), 'sekce S1, kroky 4 a 5', 'kroky k přeměření v zadání uzavření')
    k.chyby.push(...q.chyby.map(x => `kvóta: ${x}`))
    return k.chyby
  },
}
