// 97 · kolečko · 1.6.0 (spec § 1.3, § 1.6, § 2 A1): args ze souboru kolečka, follow-up za 2 500 znaky dojde do závěru celý (běh web-rijen:
// ořez ztratil 3 ze 14, mezi nimi HTTP 500 k bezpečnostní opravě), FOLLOW-UP mimo balíčky do follow-upů, deploy zapíše nasazení
// (řez 11 pak nasadil API a admin znovu) a oprava po E2E mimo apps a packages jde bránou a jen commitem bez nasazení (review 1.6.0
// N10: kód mimo apps a packages bránu potřebuje). Rámec neradí Monitor.
import { argsKolecko, kontrola, stub, e2ePass, oprava, CWD, PLUGIN } from '../stuby.mjs'

const FAIL = e2ePass(5, { vysledek: 'fail', pass: 4, fail: 1, fail_kriteria: ['K3: měřicí nástroj padá'] })

export default {
  nazev: 'kolečko: args ze souboru, celé seznamy, zápis nasazení, oprava mimo kód',
  blok: 'blok-kolecko',
  args: { cwd: CWD, plugin_root: PLUGIN, args_file: 'docs/.kolecko.json' },
  odpoved(label) {
    if (label === 'review:kolečko:1') return stub(label, { nalezu: 2, blokujicich: 0, balicky: [{ soubory: ['apps/sucho/a.ts'], nalezy: ['N1'] }], follow_up_ids: ['FU-97-MIMO'] })
    if (label === 'fix:kolečko:kolo 1:1') return oprava({ follow_ups: [`dlouhý ${'y'.repeat(2400)}`, 'FU-97-ZA-2500 konec seznamu'] })
    if (label === 'e2e:kolečko:1') return FAIL
    if (label === 'fix-e2e:kolečko:1') return oprava({ zmenena_mista: ['scripts/mereni/vzhled.mjs: porovnej'] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const a = k.jeden('args:kolečko')
    k.agent(a, 'dev-pipeline:nacteni-args', 'sonnet', 'low')
    k.obsahuje(a, `${CWD}/docs/.kolecko.json`, 'soubor args kolečka')
    const z = k.jeden('závěr:kolečko')
    k.obsahuje(z, 'FU-97-ZA-2500', 'follow-up za 2 500 znaky')
    k.obsahuje(z, 'FU-97-MIMO (FOLLOW-UP z', 'FOLLOW-UP mimo balíčky')
    const d = k.jeden('deploy:kolečko:1')
    k.obsahuje(d, `${CWD}/docs/e2e/kolecko-nasazeni.md`, 'zápis nasazení kolečka'); k.obsahuje(d, 'kolecko: zápis nasazení', 'commit zápisu')
    k.ok(v && v.deploy && /^[0-9a-f]{40}$/.test(v.deploy.commit_zapisu || ''), `návrat.deploy.commit_zapisu: ${JSON.stringify(v && v.deploy)}`)
    k.jeden('commit:kolečko:oprava po E2E'); k.nic(/^deploy:kolečko:2$/, 'oprava mimo apps a packages nenasazuje'); k.jeden('verify:kolečko:oprava po E2E:1')
    k.ok(!volani.some(x => /přes `Monitor`/.test(x.prompt)), 'rámec radí Monitor')
    const f = k.jeden('fix:kolečko:kolo 1:1'); k.ok(f && f.povinne.includes('opravene_ids'), `FIX.required bez opravene_ids: ${JSON.stringify(f && f.povinne)}`)
    return k.chyby
  },
}
