// Función de Netlify: guarda la base que carga el responsable (Excel y ajustes) y se la da a todos los dispositivos.
// Cada dispositivo pregunta por las versiones de su almacén y solo descarga lo que ha cambiado.
import { getStore } from "@netlify/blobs";

const TIPOS = ["stock", "maestro", "vacias", "tipos", "ajustes", "bases"];
// Comunes a todos los almacenes: los niveles de picking y la ficha de bases (cajas por base de cada referencia)
const COMUNES = ["ajustes", "bases"];
// La base de antes de separar por almacén era de Madrid: sigue valiendo hasta que se cargue otra
const ALMACEN_ANTIGUO = "08";

const almacen = () => getStore({ name: "base", consistency: "strong" });
const lista = (nombre) => (Netlify.env.get(nombre) || "").split(",").map((c) => c.trim()).filter(Boolean);
const texto = (v, max = 200) => String(v ?? "").trim().slice(0, max);

// ---------- dispositivos que usan la app y coste de la IA de todos ----------
// Almacén «uso»: visto/<dispositivo> (última vez que sincronizó) y mes/<AAAA-MM>/<dispositivo> (lo anota escanear.mjs).
// Del código de acceso solo se guarda el nombre (la parte antes del guion), nunca el código entero.
const usoStore = () => getStore({ name: "uso", consistency: "strong" });
const mesDe = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).format(d);
const seguro = (v) => String(v).replace(/[^\w-]/g, "_").slice(0, 40);
function nombreMovil(codigo) {
  if (lista("APP_CODE_RESPONSABLE").includes(codigo)) return "Responsable";
  return codigo.includes("-") ? codigo.split("-")[0] : `Móvil ${lista("APP_CODE").indexOf(codigo) + 1}`;
}
const idDispositivo = (req, movil) => {
  const d = (req.headers.get("x-dispositivo") || "").trim();
  return /^[a-z0-9]{8,32}$/i.test(d) ? d : `cod-${seguro(movil)}`;
};
function equipoDe(ua = "") {
  const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Otro";
  const nav = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung" : /CriOS|Chrome\//.test(ua) ? "Chrome"
    : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return nav ? `${so} · ${nav}` : so;
}
async function anotarVisto(req, codigo, alm) {
  try {
    const movil = nombreMovil(codigo);
    const id = idDispositivo(req, movil);
    await usoStore().setJSON(`visto/${id}`, { id, movil, equipo: equipoDe(req.headers.get("user-agent") || ""), almacen: alm, ultimo: Date.now() });
  } catch (e) {
    console.error("No se ha podido anotar el dispositivo", e); // la sincronización sigue aunque falle
  }
}
async function leerUso() {
  const s = usoStore();
  const todo = async (prefix) => {
    const { blobs } = await s.list({ prefix });
    return Promise.all(blobs.map(async (b) => ({ id: b.key.split("/").pop(), v: await s.get(b.key, { type: "json" }) })));
  };
  const mes = mesDe(new Date());
  const [a, m] = mes.split("-").map(Number);
  const anterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  const [vistos, este, previo] = await Promise.all([todo("visto/"), todo(`mes/${mes}/`), todo(`mes/${anterior}/`)]);
  const disp = new Map();
  const de = (id, v) => disp.get(id) || disp.set(id, { id, movil: v?.movil || "", equipo: "", almacen: "", ultimo: 0, llamadas: 0, coste: 0 }).get(id);
  for (const { id, v } of vistos) if (v) Object.assign(de(id, v), { movil: v.movil, equipo: v.equipo, almacen: v.almacen, ultimo: v.ultimo });
  for (const { id, v } of este) {
    if (!v) continue;
    const d = de(id, v);
    d.llamadas = v.llamadas || 0;
    d.coste = v.coste || 0;
    d.ultimo = Math.max(d.ultimo, v.ultimo || 0);
  }
  const suma = (arr) => arr.reduce((t, { v }) => ({ llamadas: t.llamadas + (v?.llamadas || 0), coste: t.coste + (v?.coste || 0) }), { llamadas: 0, coste: 0 });
  return { mes, total: suma(este), anterior: { mes: anterior, ...suma(previo) }, dispositivos: [...disp.values()], ahora: Date.now() };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Lo común se guarda sin almacén; el resto va por almacén
const clave = (parte, tipo, alm) => (COMUNES.includes(tipo) ? `${parte}/${tipo}` : `${parte}/${alm}/${tipo}`);
async function leer(store, parte, tipo, alm) {
  const valor = await store.get(clave(parte, tipo, alm), { type: "json" });
  if (valor !== null || COMUNES.includes(tipo) || alm !== ALMACEN_ANTIGUO) return valor;
  return store.get(`${parte}/${tipo}`, { type: "json" });
}

async function leerEstado(store, alm) {
  const metas = {};
  await Promise.all(TIPOS.map(async (t) => { metas[t] = await leer(store, "meta", t, alm); }));
  const claves = (await store.list({ prefix: "asig/" })).blobs.map((b) => b.key).sort();
  const asignaciones = await Promise.all(claves.map((c) => store.get(c, { type: "json" })));
  return { metas, asignaciones: asignaciones.filter(Boolean) };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Solo POST" }, 405);
  const codigo = req.headers.get("x-app-code") || "";
  const responsable = !!codigo && lista("APP_CODE_RESPONSABLE").includes(codigo);
  if (!responsable && !(codigo && lista("APP_CODE").includes(codigo))) return json({ error: "Código de acceso incorrecto" }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }

  try {
    const store = almacen();
    const alm = /^\d{2}$/.test(body.almacen) ? body.almacen : ALMACEN_ANTIGUO;
    if (body.accion === "estado") {
      const [estado] = await Promise.all([leerEstado(store, alm), anotarVisto(req, codigo, alm)]);
      return json(estado);
    }

    // Cuántos dispositivos usan la app y lo que ha costado la IA entre todos: solo para el responsable
    if (body.accion === "uso") {
      if (!responsable) return json({ error: "Solo el responsable puede ver el uso de todos los dispositivos" }, 403);
      return json(await leerUso());
    }

    if (body.accion === "descargar") {
      if (!TIPOS.includes(body.tipo)) return json({ error: "Tipo desconocido" }, 400);
      // la ficha de bases es del traspaso, que solo usa el responsable
      if (body.tipo === "bases" && !responsable) return json({ error: "Solo el responsable puede ver la ficha de bases" }, 403);
      return json({ datos: await leer(store, "datos", body.tipo, alm) });
    }

    if (body.accion === "subir") {
      if (!responsable) return json({ error: "Solo el responsable puede cambiar la base" }, 403);
      if (!TIPOS.includes(body.tipo) || !body.datos || typeof body.datos !== "object") return json({ error: "Datos no válidos" }, 400);
      const version = Date.now();
      // primero los datos: quien vea la versión nueva siempre los encuentra
      await store.setJSON(clave("datos", body.tipo, alm), body.datos);
      await store.setJSON(clave("meta", body.tipo, alm), { version });
      return json({ version });
    }

    // Ficha de bases (sale de la ficha técnica): solo el responsable la importa o la corrige.
    // Se mezcla referencia a referencia, para que un cambio no pise los demás.
    if (body.accion === "ficha") {
      if (!responsable) return json({ error: "Solo el responsable puede cambiar la ficha de bases" }, 403);
      const entrada = body.items && typeof body.items === "object" ? Object.entries(body.items).slice(0, 3000) : [];
      if (!entrada.length) return json({ error: "Datos no válidos" }, 400);
      const n = (v, max, entero) => {
        const x = Number(v);
        if (!(x > 0) || x > max) return null;
        return entero ? Math.round(x) : Math.round(x * 1000) / 1000;
      };
      const actual = (await leer(store, "datos", "bases", alm)) || { items: {} };
      const items = actual.items || {};
      const t = Date.now();
      for (const [ref, v] of entrada) {
        const k = texto(ref, 40).toUpperCase();
        if (!k || !v || typeof v !== "object") continue;
        const nuevo = { ...(items[k] || {}) };
        if ("kgCaja" in v) nuevo.kgCaja = n(v.kgCaja, 2000, false);
        if ("cajasBase" in v) nuevo.cajasBase = n(v.cajasBase, 1000, true);
        if ("basesPalet" in v) nuevo.basesPalet = n(v.basesPalet, 100, true);
        if ("udCaja" in v) nuevo.udCaja = n(v.udCaja, 100000, false);
        if ("bulto" in v) nuevo.bulto = texto(v.bulto, 5).toUpperCase() || null;
        // el nombre del artículo; el propio código no vale como nombre (se borra si había quedado así)
        const desc = texto(v.desc);
        if (desc && desc.toUpperCase() !== k) nuevo.desc = desc;
        else if (String(nuevo.desc || "").trim().toUpperCase() === k) delete nuevo.desc;
        // de dónde sale el dato: importado de la ficha técnica o corregido a mano;
        // si solo llega el nombre del artículo (lo recupera otro equipo), se queda como estaba
        if (v.origen === "nombre" && items[k]) { items[k] = nuevo; continue; }
        items[k] = { ...nuevo, t, por: v.origen === "importada" ? "Ficha técnica" : "Cambiada a mano" };
      }
      const version = t;
      await store.setJSON(clave("datos", "bases", alm), { items });
      await store.setJSON(clave("meta", "bases", alm), { version });
      return json({ version, items });
    }

    // Una asignación de picking hecha desde cualquier móvil la ven todos
    if (body.accion === "asignar") {
      const articulo = texto(body.articulo), ubicacion = texto(body.ubicacion);
      if (!articulo || !ubicacion) return json({ error: "Datos no válidos" }, 400);
      const azar = Math.random().toString(36).slice(2, 8);
      await store.setJSON(`asig/${Date.now()}-${azar}`, { articulo, ubicacion, descripcion: texto(body.descripcion) });
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "No se ha podido guardar o leer la base compartida" }, 502);
  }
};

export const config = { path: "/api/base" };
