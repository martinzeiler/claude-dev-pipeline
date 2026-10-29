// 191 · stavba · 1.10.0 (review N4, plan-check N5): commit opravy po E2E bez review se zapíše hned po commitu, i když nasazení opravy
// zastaví výpadek platformy: zastavený návrat i soubor zastaveného běhu ho nesou a obnova ho převezme přes obnova-stav do svého návratu.
// Oprava brány a samostatná oprava thermo do bez_review nepatří (jsou v commitu řezu, který review prošel). Když zápis souboru zastaveného
// běhu selže, návrat nese seznamy_zapsane false i tehdy, když jediný seznam je bez_review (review N18).
import { argsStavby, kontrola, stub, e2ePass, oprava, zelenaBrana, hash } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK2 Formulář', selhani: 'neuloží' }] })
const OPRAVA = hash('oprava-191')

export default {
  nazev: 'bez_review při zastavení a v obnově',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, p, o, stav) {
    if (label === 'verify:řez 05:1') return zelenaBrana({ selhalo: 1, exit_kod: 1 })
    if (label === 'e2e:řez 05:1') return FAIL
    if (label === 'fix-e2e:řez 05:1') return oprava({ zmenena_mista: ['apps/sucho/formular.ts: uloz'], radku_zmeneno: 30 })
    if (label === 'deploy:řez 05:2') return stub(label, { stav: 'failed', infra: true, infra_trida: 'platforma', commit: OPRAVA, duvod: 'Deploys have been paused' })
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'zastaveno', faze: 'deploy-vypadek' })
    const br = v && v.bez_review
    k.ok(Array.isArray(br) && br.length === 1 && br[0].commit === OPRAVA && /^oprava po E2E \(pokus 1\) bez review/.test(br[0].popis), `bez_review zastaveného návratu: ${JSON.stringify(br)}`)
    k.obsahuje(k.jeden('uzavření:řez 05:zastaveno'), `"bez_review":[{"commit":"${OPRAVA}"`, 'bez_review v souboru zastaveného běhu')
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'deploy', znacka: 'Z191', pokus: 1, bez_cache: true } }), odpoved: l => l === 'obnova-stav:řez 05' ? { commit_rezu: hash('rez'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [], bez_review: br } : null })
    k.ok(obnova.vysledek && obnova.vysledek.vysledek === 'hotovo' && pole(obnova.vysledek.bez_review).some(x => x.commit === OPRAVA), `bez_review po obnově: ${JSON.stringify(obnova.vysledek && obnova.vysledek.bez_review)}`)
    k.ok(v && v.seznamy_zapsane === true && v.zastaveno_soubor, `zápis prošel: seznamy_zapsane ${v && v.seznamy_zapsane}`)
    const selhal = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: (l, p, o, st) => l === 'uzavření:řez 05:zastaveno' ? { ok: false, vysledek_soubor: '', poznamka: 'zápis selhal' } : this.odpoved(l, p, o, st) })
    k.ok(selhal.vysledek && selhal.vysledek.seznamy_zapsane === false && !selhal.vysledek.zastaveno_soubor && pole(selhal.vysledek.bez_review).length === 1, `zápis selhal, jen bez_review: ${JSON.stringify(selhal.vysledek && [selhal.vysledek.seznamy_zapsane, selhal.vysledek.zastaveno_soubor, selhal.vysledek.follow_ups_pocet])}`)
    return k.chyby
  },
}
const pole = x => Array.isArray(x) ? x : []
