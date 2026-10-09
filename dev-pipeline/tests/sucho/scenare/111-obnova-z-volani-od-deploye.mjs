// 111 · stavba · 1.7.0 (spec § 1.4, § 2 A1): obnova přichází jen z volání. S args_file a obnovou {od_faze: 'deploy'} ve volání dostanou
// značku jen fáze od deploye; obnova ze souboru (agent ji vrátí jinou) se ignoruje. První nasazení pokusu po obnově nesmí do zprávy
// commitu psát „po E2E“ (běh sonnet-5-5: commit 7f6d9723 „dorovnání stavby po E2E“ bez E2E).
import { argsStavby, kontrola, CWD, PLUGIN } from '../stuby.mjs'

const Z = 'ZNACKA-111'

export default {
  nazev: 'obnova z volání s od_faze deploy',
  blok: 'blok-stavby',
  args: { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: 'docs/.stavba-05.json', obnova: { od_faze: 'deploy', znacka: Z, pokus: 1 } },
  odpoved(label) {
    if (label === 'args:řez 05') return { ...argsStavby(), rez: '05', obnova: { od_faze: 'refresh', znacka: 'ZE-SOUBORU' } }
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    for (const l of ['deploy:řez 05:1', 'e2e:řez 05:1', 'uzavření:řez 05']) k.obsahuje(k.jeden(l), Z, `značku obnovy ${Z}`)
    for (const l of ['implement:řez 05:1', 'review:řez 05:1', 'verify:řez 05:1']) k.neobsahuje(k.jeden(l), Z, 'značku obnovy (fáze před deployem)')
    for (const x of volani) k.neobsahuje(x, 'ZE-SOUBORU', 'obnovu ze souboru')
    k.obsahuje(k.jeden('deploy:řez 05:1'), '„po E2E“ do ní nepiš', 'zákaz „po E2E“ v commitu obnovy před E2E')
    return k.chyby
  },
}
