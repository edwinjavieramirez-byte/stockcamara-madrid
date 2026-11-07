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
    if (body.accion === "estado") return json(await leerEstado(store, alm));

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
        if (v.desc) nuevo.desc = texto(v.desc);
        // de dónde sale el dato: importado de la ficha técnica o corregido a mano
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
