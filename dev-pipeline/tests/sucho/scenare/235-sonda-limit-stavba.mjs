// 235 · stavba · 1.12.0 (spec F1 a F2): limit účtu není selhání řezu. Po třech voláních bez výsledku běží sonda (jedno levné volání na modelu
// selhaného volání); bez odpovědi blok nic dalšího nespouští a vrátí zastavení s fází agenti: pokus se nepočítá, diagnóza ani uzavření
// neběží. Když sonda odpoví, platí dřívější chování (tři pokusy a diagnóza). Výjimka s textem limitu nastaví příznak bez opakování.
// Obnova přes cache po resetu limitu přehraje volání před prvním selhaným z cache a doběhne.
import { argsStavby, kontrola, stub, CWD, PLUGIN, NIC, S } from '../stuby.mjs'
import { spust } from '../harness.mjs'

// Agenti neběží od prvního volání, jehož label sedí na vzor: bez výsledku zůstane ono i jeho sonda.
const limitOd = re => l => (re.test(l.replace(/^sonda:/, '')) ? NIC : null)
const AGENTI = { ok: true, vysledek: 'zastaveno', faze: 'agenti', infra: true, infra_trida: 'ucet', pokusy: 1 }

export default {
  nazev: 'limit účtu: sonda bez odpovědi zastaví stavbu s fází agenti',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: limitOd(/^implement:/),
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ...AGENTI, seznamy_zapsane: true, follow_ups: [], rozhodnuti: [] })
    k.rovno(volani.map(x => x.label), ['implement:řez 05:1', 'implement:řez 05:1', 'implement:řez 05:1', 'sonda:implement:řez 05:1'], 'tři volání a sonda, nic dalšího')
    const s = k.jeden('sonda:implement:řez 05:1')
    k.ok(s && s.model === 'opus' && s.effort === 'low' && !s.agentType && !s.klice.length, `sonda na modelu selhaného volání, effort low, bez schématu: ${JSON.stringify(s && [s.model, s.effort, s.agentType, s.klice])}`)
    k.obsahuje(s, 'jedním slovem', 'zadání sondy')
    k.ok(/agenti neběží/.test(S(v && v.detail)) && /implement:řez 05:1/.test(S(v && v.detail)), `návrat.detail: ${JSON.stringify(v && v.detail)}`)
    k.ok(logy.some(l => /pokus se nepočítá, diagnóza ani uzavření neběží/.test(l)), 'log zastavení')

    // Sonda odpoví: bez výsledku zůstalo jen zadání implementace, řez selže po třech pokusech s diagnózou jako dřív.
    const zive = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => (/^implement:/.test(l) ? NIC : null) })
    const z = kontrola(zive.volani)
    z.navrat(zive.vysledek, { ok: true, vysledek: 'selhalo', pokusy: 3, faze: 'implementace' })
    z.pocet(/^implement:/, 9, 'tři pokusy po třech voláních'); z.pocet(/^sonda:implement:/, 3, 'sonda za každým pokusem'); z.jeden('diagnose:řez 05')
    k.chyby.push(...z.chyby.map(c => `sonda odpověděla: ${c}`))

    // Výjimka s textem limitu: příznak rovnou, bez opakování a bez sondy.
    const vyj = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => { if (/^implement:/.test(l)) throw new Error("usage limit; resets at 12pm, too far out to wait for: You've hit your weekly limit"); return null } })
    k.navrat(vyj.vysledek, AGENTI)
    k.rovno(vyj.volani.map(x => x.label), ['implement:řez 05:1'], 'výjimka s textem limitu: jedno volání')

    // Limit uprostřed bloku (brána): žádná oprava brány, deploy ani uzavření; obnova přes cache doběhne bez sondy.
    const brana = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: limitOd(/^verify:/) })
    const b = kontrola(brana.volani)
    b.navrat(brana.vysledek, AGENTI)
    b.nic(/^(fix-brana|deploy|e2e|uzavření|diagnose|implement:řez 05:2)/, 'po limitu u brány')
    b.pocet(/^sonda:/, 1, 'jedna sonda')
    k.chyby.push(...b.chyby.map(c => `limit u brány: ${c}`))
    const obnova = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: () => null }, { cache: brana.volani })
    const o = kontrola(obnova.volani)
    o.navrat(obnova.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    o.nic(/^sonda:/, 'sonda při obnově')
    o.ok(obnova.volani.filter(x => /^(implement|review|thermo):/.test(x.label)).every(x => x.z_cache) && !o.jeden('verify:řez 05:1').z_cache, 'volání před bránou z cache, brána živě')
    k.chyby.push(...o.chyby.map(c => `obnova po limitu: ${c}`))

    // Limit u review, které blok jinak toleruje („pokračuji bránou“): po sondě bez odpovědi už žádné volání, ani brána.
    const rev = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: limitOd(/^review:/) })
    k.navrat(rev.vysledek, AGENTI)
    const posledni = rev.volani.map(x => x.label)
    k.ok(posledni[posledni.length - 1] === 'sonda:review:řez 05:1' && !posledni.some(l => /^(verify|deploy|e2e|uzavření):/.test(l)), `po sondě bez odpovědi nic neběží: ${posledni.slice(-4).join(', ')}`)

    // Limit až u uzavření: řez není „hotovo“ s neproběhlým uzavřením, blok čeká na obnovu.
    const uz = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: limitOd(/^uzavření:/) })
    k.navrat(uz.vysledek, AGENTI)

    // Limit v běhu, který sám byl obnovou (review N2): odklad, obnova od deploye, deploy projde, limit u E2E. Návrat nese obnova z args
    // a obnova s týmiž args (i obnova) vrátí obnova-stav i deploy z cache: druhé nasazení ani kroky po nasazení neběží.
    const KDY = '2026-10-07T02:30:00+02:00'
    const odklad = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'deploy:řez 05:1' ? stub(l, { stav: 'odlozeno', nejdriv: KDY, duvod: 'okno', commit: 'c'.repeat(40) }) : null })
    const OBN = { od_faze: 'deploy', znacka: 'Z235', pokus: 1 }
    const vObnove = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: OBN }), odpoved: limitOd(/^e2e:/) }, { cache: odklad.volani })
    k.navrat(vObnove.vysledek, AGENTI)
    k.rovno(vObnove.vysledek && vObnove.vysledek.obnova, OBN, 'zastavení v obnově nese obnova z args')
    const znovu = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: vObnove.vysledek && vObnove.vysledek.obnova }), odpoved: () => null }, { cache: vObnove.volani })
    const zn = kontrola(znovu.volani)
    zn.navrat(znovu.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const zc = l => (zn.jeden(l) || {}).z_cache
    zn.ok(zc('obnova-stav:řez 05') && zc('deploy:řez 05:1'), 'obnova-stav a deploy z cache, nasazení neběží podruhé')
    zn.ok(zc('e2e:řez 05:1') === false, 'E2E živě')
    zn.nic(/^sonda:/, 'sonda při obnově')
    k.chyby.push(...zn.chyby.map(c => `obnova po limitu v obnově: ${c}`))
    k.ok(!('obnova' in (brana.vysledek || {})), 'zastavení mimo obnovu obnova nenese')

    // Limit už u načtení args (review N5 kolečka): tři volání načítacího agenta a sonda bez odpovědi zastaví blok s fází agenti, ne ok: false.
    const ARGS_FILE = { cwd: CWD, plugin_root: PLUGIN, rez: 5, args_file: `${CWD}/docs/.stavba-05.json` }
    const nacteni = await spust({ blok: 'blok-stavby', args: { ...ARGS_FILE, obnova: OBN }, odpoved: limitOd(/^args:/) })
    k.navrat(nacteni.vysledek, { ...AGENTI, rez: '05', pokusy: 0, follow_ups: [], rozhodnuti: [], obnova: OBN })
    k.rovno(nacteni.volani.map(x => x.label), ['args:řez 05', 'args:řez 05', 'args:řez 05', 'sonda:args:řez 05'], 'načtení args: tři volání a sonda')
    const nactSonda = await spust({ blok: 'blok-stavby', args: ARGS_FILE, odpoved: l => (/^args:/.test(l) ? NIC : null) })
    k.navrat(nactSonda.vysledek, { ok: false })
    k.ok(/načítací agent nevrátil výsledek/.test(S(nactSonda.vysledek && nactSonda.vysledek.duvod)), `sonda odpověděla: ${JSON.stringify(nactSonda.vysledek)}`)
    const nactVyj = await spust({ blok: 'blok-stavby', args: ARGS_FILE, odpoved: l => { if (/^args:/.test(l)) throw new Error('usage limit reached'); return null } })
    k.navrat(nactVyj.vysledek, { ...AGENTI, pokusy: 0 })
    k.rovno(nactVyj.volani.map(x => x.label), ['args:řez 05'], 'výjimka s textem limitu u načtení: jedno volání')
    return k.chyby
  },
}
