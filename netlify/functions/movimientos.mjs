// Función de Netlify: guarda lo que anotan los móviles y se lo da al responsable.
// Cada evento (alta, hecho, deshacer, borrar) es un blob nuevo que nunca se reescribe,
// así dos móviles anotando a la vez no se pisan. El móvil reconstruye el estado leyéndolos en orden.
import { getStore } from "@netlify/blobs";

const TIPOS = new Set(["alta", "hecho", "deshacer", "borrar"]);
const POR_LOTE = 50; // eventos que se aceptan en un envío
const POR_CONSULTA = 200; // eventos que se devuelven en una consulta
// Dos servidores pueden tener el reloj algo distinto: se repasan los últimos segundos para no saltarse nada.
// El móvil ignora lo que ya tiene, así que repetir eventos no duplica movimientos.
const SOLAPE_MS = 30000;

const almacen = () => getStore({ name: "movimientos", consistency: "strong" });
const lista = (nombre) => (Netlify.env.get(nombre) || "").split(",").map((c) => c.trim()).filter(Boolean);
const diaDe = (ms) => new Date(ms).toISOString().slice(0, 10);

// El nombre del móvil sale de lo que hay antes del primer guion del código (movil1-k8f2 -> movil1).
// La parte secreta nunca se guarda.
function identificar(codigo) {
  if (!codigo) return null;
  if (lista("APP_CODE_RESPONSABLE").includes(codigo)) return { movil: "Responsable", responsable: true };
  const i = lista("APP_CODE").indexOf(codigo);
  if (i < 0) return null;
  return { movil: codigo.includes("-") ? codigo.split("-")[0] : `Móvil ${i + 1}`, responsable: false };
}

const texto = (v, max = 200) => String(v ?? "").trim().slice(0, max);
function limpiarMov(m) {
  const cajas = parseInt(m?.cajas, 10);
  if (!(cajas > 0) || cajas > 100000 || !texto(m?.articulo) || !texto(m?.hacia)) return null;
  return {
    fecha: Number(m.fecha) || Date.now(),
    articulo: texto(m.articulo), descripcion: texto(m.descripcion), hacia: texto(m.hacia), desde: texto(m.desde),
    cajas, ua: texto(m.ua), lote: texto(m.lote), caducidad: texto(m.caducidad),
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function guardarEventos(eventos, quien) {
  const store = almacen();
  const ahora = Date.now();
  const validos = [];
  for (const e of eventos.slice(0, POR_LOTE)) {
    if (!TIPOS.has(e?.tipo) || !/^[\w-]{1,60}$/.test(String(e?.id ?? ""))) continue;
    const ev = { tipo: e.tipo, id: e.id, movil: quien.movil, responsable: quien.responsable, en: ahora };
    if (e.tipo === "alta") {
      ev.mov = limpiarMov(e.mov);
      if (!ev.mov) continue;
    } else if (e.tipo !== "borrar" && !quien.responsable) continue; // solo el responsable marca como hecho
    validos.push(ev);
  }
  // el índice mantiene el orden dentro del lote; la parte aleatoria evita choques entre móviles
  await Promise.all(validos.map((ev, i) => {
    const azar = Math.random().toString(36).slice(2, 8);
    return store.setJSON(`ev/${diaDe(ahora)}/${ahora}-${String(i).padStart(3, "0")}-${azar}`, ev);
  }));
  return validos.length;
}

async function leerNovedades(desde, exacto) {
  const store = almacen();
  const valido = /^ev\/\d{4}-\d{2}-\d{2}\/\d{13}-/.test(desde || "");
  let claves;
  let suelo = "";
  if (valido) {
    const ms = Number(desde.split("/")[2].split("-")[0]);
    const inicio = exacto ? ms : ms - SOLAPE_MS;
    suelo = exacto ? desde : `ev/${diaDe(inicio)}/${inicio}`;
    // solo se listan los días que hacen falta, para que la consulta no crezca con el historial
    const dias = [];
    for (let t = Date.parse(diaDe(inicio)); t <= Date.now(); t += 864e5) dias.push(diaDe(t));
    const listas = await Promise.all(dias.map((d) => store.list({ prefix: `ev/${d}/` })));
    claves = listas.flatMap((l) => l.blobs.map((b) => b.key));
  } else {
    claves = (await store.list({ prefix: "ev/" })).blobs.map((b) => b.key);
  }
  const nuevas = claves.filter((c) => !suelo || c > suelo).sort();
  const pagina = nuevas.slice(0, POR_CONSULTA);
  const eventos = await Promise.all(pagina.map(async (clave) => ({ ...(await store.get(clave, { type: "json" })), clave })));
  const ultimo = pagina[pagina.length - 1];
  return { eventos, cursor: ultimo && (!valido || ultimo > desde) ? ultimo : desde || "", mas: nuevas.length > pagina.length };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Solo POST" }, 405);
  const quien = identificar(req.headers.get("x-app-code") || "");
  if (!quien) return json({ error: "Código de acceso incorrecto" }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }

  try {
    if (body.accion === "eventos") {
      if (!Array.isArray(body.eventos)) return json({ error: "Faltan los eventos" }, 400);
      return json({ guardados: await guardarEventos(body.eventos, quien) });
    }
    if (body.accion === "novedades") {
      if (!quien.responsable) return json({ error: "Este móvil no es de responsable" }, 403);
      return json(await leerNovedades(String(body.desde || ""), !!body.exacto));
    }
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "No se han podido guardar o leer los movimientos" }, 502);
  }
};

export const config = { path: "/api/movimientos" };
