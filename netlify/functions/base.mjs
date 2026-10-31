// Función de Netlify: guarda la base que carga el responsable (Excel y ajustes) y se la da a todos los dispositivos.
// Cada dispositivo pregunta por las versiones y solo descarga lo que ha cambiado.
import { getStore } from "@netlify/blobs";

const TIPOS = ["stock", "maestro", "vacias", "tipos", "ajustes"];

const almacen = () => getStore({ name: "base", consistency: "strong" });
const lista = (nombre) => (Netlify.env.get(nombre) || "").split(",").map((c) => c.trim()).filter(Boolean);
const texto = (v, max = 200) => String(v ?? "").trim().slice(0, max);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function leerEstado(store) {
  const metas = {};
  await Promise.all(TIPOS.map(async (t) => { metas[t] = await store.get(`meta/${t}`, { type: "json" }); }));
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
    if (body.accion === "estado") return json(await leerEstado(store));

    if (body.accion === "descargar") {
      if (!TIPOS.includes(body.tipo)) return json({ error: "Tipo desconocido" }, 400);
      return json({ datos: await store.get(`datos/${body.tipo}`, { type: "json" }) });
    }

    if (body.accion === "subir") {
      if (!responsable) return json({ error: "Solo el responsable puede cambiar la base" }, 403);
      if (!TIPOS.includes(body.tipo) || !body.datos || typeof body.datos !== "object") return json({ error: "Datos no válidos" }, 400);
      const version = Date.now();
      // primero los datos: quien vea la versión nueva siempre los encuentra
      await store.setJSON(`datos/${body.tipo}`, body.datos);
      await store.setJSON(`meta/${body.tipo}`, { version });
      return json({ version });
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
