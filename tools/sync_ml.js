// Agente de sincronización Carilo Motors · Mercado Libre -> GitHub (data/ml/)
// Uso: en una pestaña de https://auto.mercadolibre.com.ar, definir antes
//   window.IDS = ['2297884153', ...]   (números de las publicaciones ACTIVAS, sacados del listado del vendedor)
// y ejecutar este script. Deja en window.SYNC:
//   { cambios: bool, resumen: [texto...], archivos: [{ruta, nuevo, contenido}] }
// Cada archivo es chico (un auto). El agente guarda en GitHub solo los que figuran en "archivos".
(async () => {
  const RAW = 'https://raw.githubusercontent.com/carilomotors/catalogo/main/data/ml/';
  const KEY = ['Marca','Modelo','Año','Versión','Color','Kilómetros','Tipo de combustible','Puertas','Transmisión','Motor','Tipo de carrocería','Potencia','Control de tracción'];
  const SKIP = new Set([...KEY,'Acepta permuta','Capacidad de personas','Distancia entre ejes','Capacidad del tanque','Válvulas por cilindro','Largo x Altura x Ancho','Inspección vehicular','Dirección']);
  const grab = (h, key, open, close) => { const i = h.indexOf(key); if (i < 0) return null; let d = 0;
    for (let j = i + key.length; j < h.length; j++) { if (h[j] === open) d++; else if (h[j] === close && --d === 0) return JSON.parse(h.slice(i + key.length, j + 1)); } return null; };
  const num = s => +String(s || '').replace(/[^\d]/g, '') || null;
  const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object'
    ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
  const fmt = o => JSON.stringify(o, null, 1);
  const t0 = Date.now(), raw = async f => (await fetch(RAW + f + '?t=' + t0)).json();

  const ids = [...new Set((window.IDS || []).map(x => 'MLA' + String(x).replace(/\D/g, '')))];
  if (ids.length < 3) return (window.SYNC = {cambios: false, error: 'Faltan IDS del listado (menos de 3): no se toca nada'});

  async function leer(id) {
    const h = await (await fetch('/MLA-' + id.slice(3), {credentials: 'omit'})).text();
    const doc = new DOMParser().parseFromString(h, 'text/html');
    const specs = grab(h, '"specs":', '[', ']') || [];
    const attrs = {}; specs.forEach(g => (g.attributes || []).forEach(a => attrs[a.id] = a.text));
    if (!attrs['Marca']) return null;
    const pr = doc.querySelector('.ui-pdp-price__second-line .andes-money-amount');
    const desc = doc.querySelector('.ui-pdp-description__content')?.textContent || '';
    const pm = desc.match(/PERMUTA[^\d\n]{0,25}([\d.]{3,})/i);
    return {
      id, t: doc.querySelector('h1')?.textContent.trim(),
      cur: (pr?.querySelector('.andes-money-amount__currency-symbol')?.textContent || '$').replace('U$S', 'US$'),
      p: num(pr?.querySelector('.andes-money-amount__fraction')?.textContent), perm: pm ? num(pm[1]) : null,
      a: Object.fromEntries(KEY.filter(k => attrs[k]).map(k => [k, attrs[k]])), dir: attrs['Dirección'] || null,
      eq: Object.entries(attrs).filter(([k, v]) => !SKIP.has(k) && v === 'Sí').map(([k]) => k),
      pics: (grab(h, '"pictures":', '[', ']') || []).map(p => p.id),
      intro: desc.split(/FICHA T[ÉE]CNICA/i)[0].split('\n').slice(1).join('\n').trim()
    };
  }

  const idx = await raw('index.json');
  const porId = Object.fromEntries(idx.map(i => [i.id, i]));
  let maxCode = Math.max(142, ...idx.map(i => +String(i.code).replace(/\D/g, '') || 0));
  const archivos = [], resumen = [];
  for (const id of ids) {
    let r = null; try { r = await leer(id); } catch (e) {}
    if (!r) { resumen.push(`AVISO: no pude leer ${id}, se deja como estaba`); continue; }
    const ent = porId[id];
    const nombre = `${r.a['Marca']} ${r.a['Modelo']} ${r.a['Año']}`;
    if (!ent) {
      const code = 'CM-' + String(++maxCode).padStart(4, '0');
      r.code = code; idx.push({id, code, pausada: false}); porId[id] = idx[idx.length - 1];
      resumen.push(`NUEVO ${code} ${nombre} · ${r.cur} ${r.p}`);
      archivos.push({ruta: `data/ml/${id}.json`, nuevo: true, contenido: fmt(r)});
      continue;
    }
    r.code = ent.code;
    let prev = null; try { prev = await raw(id + '.json'); } catch (e) {}
    if (prev?.tipo) r.tipo = prev.tipo;
    if (ent.pausada) { ent.pausada = false; resumen.push(`REACTIVADO ${ent.code} ${nombre}`); }
    if (prev && canon(prev) === canon(r)) continue;
    if (prev) {
      if (prev.p !== r.p || prev.cur !== r.cur) resumen.push(`PRECIO ${r.code} ${nombre}: ${prev.cur} ${prev.p} → ${r.cur} ${r.p}`);
      if (prev.perm !== r.perm) resumen.push(`PERMUTA ${r.code} ${nombre}: ${prev.perm} → ${r.perm}`);
      if (prev.a?.['Kilómetros'] !== r.a['Kilómetros']) resumen.push(`KM ${r.code} ${nombre}: ${prev.a?.['Kilómetros']} → ${r.a['Kilómetros']}`);
      if (canon(prev.pics) !== canon(r.pics)) resumen.push(`FOTOS ${r.code} ${nombre}`);
      if (prev.intro !== r.intro || canon(prev.eq) !== canon(r.eq)) resumen.push(`DESCRIPCIÓN/EQUIPAMIENTO ${r.code} ${nombre}`);
    }
    archivos.push({ruta: `data/ml/${id}.json`, nuevo: !prev, contenido: fmt(r)});
  }
  for (const ent of idx) if (!ids.includes(ent.id) && !ent.pausada) {
    ent.pausada = true; resumen.push(`PAUSADO/VENDIDO ${ent.code} (${ent.id}) → sale del catálogo`);
  }
  const idxNuevo = fmt(idx), idxViejo = fmt(await raw('index.json'));
  if (idxNuevo !== idxViejo) archivos.push({ruta: 'data/ml/index.json', nuevo: false, contenido: idxNuevo});
  window.SYNC = {cambios: archivos.length > 0, activos: ids.length, resumen, archivos};
  return {cambios: window.SYNC.cambios, activos: ids.length, resumen, archivos: archivos.map(a => `${a.ruta} (${a.nuevo ? 'nuevo' : 'modificado'}, ${a.contenido.length} caracteres)`)};
})();
