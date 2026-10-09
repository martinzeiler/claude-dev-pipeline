// 118 · stavba · 1.7.0 (spec § 1.3, § 1.5): deploy vrátí odlozeno s nejdriv (okno nebo podmínka brání víc než ~30 min). Blok zastaví
// s fází deploy-odklad a časem nejdriv, ne jako infra; pokus se nepočítá. Seznamy přerušeného běhu zapíše uzavření v režimu
// zastaveno (Sonnet low) do docs/.vysledek-stavba-NN-zastaveno.json (běh sonnet-5-5: obnova přepsala výsledek, 87 follow-upů pryč).
import { argsStavby, kontrola, stub, CWD } from '../stuby.mjs'

const C = 'c'.repeat(40), KDY = '2026-10-07T02:30:00+02:00'

export default {
  nazev: 'odklad nasazení zastaví blok s časem nejdriv',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'implement:řez 05:1') return { ...stub(label), follow_ups: ['FU-118 dlouhý seznam z přerušeného běhu'], odchylky_od_prd: ['OD-118'] }
    if (label === 'deploy:řez 05:1') return stub(label, { stav: 'odlozeno', nejdriv: KDY, duvod: 'zakázané okno 00:45–02:20', commit: C })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad', nejdriv: KDY, commit: C, pokusy: 1 })
    k.ok(v && !v.infra, 'odklad není infra')
    k.ok(v && /docs\/\.vysledek-stavba-05-zastaveno\.json$/.test(v.zastaveno_soubor || ''), `zastaveno_soubor: ${v && v.zastaveno_soubor}`)
    const z = k.jeden('uzavření:řez 05:zastaveno')
    k.agent(z, 'dev-pipeline:uzavreni', 'sonnet', 'low')
    k.obsahuje(z, 'uzavření ZASTAVENÉHO bloku', 'režim zastaveno')
    k.obsahuje(z, `${CWD}/docs/.vysledek-stavba-05-zastaveno.json`, 'soubor seznamů')
    k.obsahuje(z, 'FU-118', 'follow-upy přerušeného běhu'); k.obsahuje(z, 'OD-118', 'odchylky přerušeného běhu')
    k.nic(/^(e2e|implement:řez 05:2|diagnose|uzavření:řez 05$)/, 'odklad nespotřebuje pokus ani nejde dál')
    const d = k.jeden('deploy:řez 05:1')
    k.obsahuje(d, 'vrať stav odlozeno s nejdriv', 'pravidlo odkladu v zadání deploye')
    k.pole(d, ['nejdriv', 'security_radkem'], 'DEPLOY')
    k.ok(d && d.schema.properties.stav.enum.includes('odlozeno'), 'DEPLOY.stav bez odlozeno')
    return k.chyby
  },
}
