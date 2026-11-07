// 226 · stavba · 1.11.0 (spec I1): kritérium, které čeká déle než ~30 min, se změří startem a průběhem a vrátí v k_domereni; řez se uzavře jako nejvýš
// pass-castecne a uvolní slot (řez 03 držel slot 4 h 33). Položka bez čtecí kontroly nebo platného času je FAIL. V kolečku se nepoužije.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const DOM = { kriterium: 'AK9 Noční běh', co_bezi: 'běh 123 od 02:00', kontrola: "psql -c 'select stav from behy'", nejdriv: '2026-11-08T06:00:00+01:00' }

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
    return k.chyby
  },
}
