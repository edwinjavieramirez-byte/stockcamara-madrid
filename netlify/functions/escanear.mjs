// Función de Netlify: recibe la foto de una etiqueta (o texto + candidatos)
// y usa Claude para leerla. La clave de la API vive solo aquí, nunca en el móvil.
import Anthropic from "@anthropic-ai/sdk";

// ANTHROPIC_API_KEY se configura en las variables de entorno de Netlify (ámbito: Functions).
// baseURL fijo: Netlify puede inyectar ANTHROPIC_BASE_URL para usar su AI Gateway, que tiene
// límites de tamaño por plan y no deja pasar cabeceras beta. Aquí se va siempre directo a Anthropic.
const client = new Anthropic({ apiKey: Netlify.env.get("ANTHROPIC_API_KEY"), baseURL: "https://api.anthropic.com" });
const MODEL = Netlify.env.get("CLAUDE_MODEL") || "claude-sonnet-5-5";

const ESQUEMA_LECTURA = {
  type: "object",
  additionalProperties: false,
  required: ["nombres", "nombre_es", "marca", "lote", "caducidad", "ean", "peso", "unidades", "otros_codigos", "legible"],
  properties: {
    nombres: { type: "array", items: { type: "string" }, description: "Nombre del producto tal como aparece impreso, una entrada por idioma" },
    nombre_es: { type: "string", description: "Nombre del producto en español (traducido si no viene en español)" },
    marca: { type: "string" },
    lote: { type: "string", description: "Número de lote / LOT / Batch / L., vacío si no aparece" },
    caducidad: { type: "string", description: "Fecha de caducidad o consumo preferente en formato AAAA-MM-DD, vacío si no aparece" },
    ean: { type: "string", description: "EAN / GTIN si se lee, vacío si no" },
    peso: { type: "string" },
    unidades: { type: "string", description: "Unidades por caja si aparece" },
    otros_codigos: { type: "array", items: { type: "string" }, description: "Otros códigos visibles (SSCC, código de artículo, referencias)" },
    legible: { type: "boolean", description: "false si la foto no permite leer la etiqueta" },
  },
};

const ESQUEMA_ELECCION = {
  type: "object",
  additionalProperties: false,
  required: ["articulo", "confianza", "motivo"],
  properties: {
    articulo: { type: "string", description: "Código de artículo elegido de la lista, o vacío si ninguno encaja" },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    motivo: { type: "string", description: "Explicación breve en español" },
  },
};

const PROMPT_LECTURA = `Eres un lector de etiquetas de cajas de producto congelado en un almacén.
Lee la etiqueta de la foto y extrae los datos. Las etiquetas pueden venir en varios idiomas.
- Copia el nombre del producto exactamente como está impreso en cada idioma que aparezca.
- El lote puede aparecer como LOT, L., Lote, Batch, Charge, Lotto o tras el identificador GS1 (10).
- La caducidad puede aparecer como Cad., Best before, BBD, Consumir preferentemente antes de, MHD, DLUO, EXP o tras (15)/(17). Conviértela a AAAA-MM-DD.
- Si un dato no aparece, déjalo vacío. No inventes nada.`;

async function llamar(content, schema) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude no ha podido procesar esta petición");
  const texto = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { datos: JSON.parse(texto), uso: response.usage };
}

// Mensajes claros para la pantalla del móvil, en vez del error en bruto de la API
function mensajeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return "La clave de Claude no es válida. Revisa ANTHROPIC_API_KEY en Netlify y vuelve a desplegar.";
  if (e instanceof Anthropic.PermissionDeniedError) return "La clave de Claude no tiene permiso para usar este modelo.";
  if (e instanceof Anthropic.NotFoundError) return "Modelo de Claude no disponible. Revisa CLAUDE_MODEL en Netlify.";
  if (e instanceof Anthropic.RateLimitError) return "Demasiadas fotos seguidas o límite de gasto alcanzado. Espera un momento y repite.";
  if (e instanceof Anthropic.APIConnectionError) return "No se ha podido conectar con Claude. Repite la foto.";
  if (e instanceof Anthropic.APIError) return `Claude ha devuelto un error (${e.status}): ${e.error?.error?.message || e.message}`;
  return e.message || "Error al llamar a Claude";
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Solo POST" }, 405);

  // Código de acceso para que nadie más gaste tu API. Admite varios separados por comas
  // (uno por móvil), así puedes anular uno sin cambiar los demás.
  const codigos = (Netlify.env.get("APP_CODE") || "").split(",").map((c) => c.trim()).filter(Boolean);
  if (codigos.length && !codigos.includes(req.headers.get("x-app-code") || "")) return json({ error: "Código de acceso incorrecto" }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }

  // Solo comprueba el código, sin llamar a Claude (no gasta nada)
  if (body.accion === "comprobar") return json({ ok: true });

  try {
    if (body.accion === "leer") {
      if (!body.imagen) return json({ error: "Falta la imagen" }, 400);
      const r = await llamar(
        [
          { type: "image", source: { type: "base64", media_type: body.tipo || "image/jpeg", data: body.imagen } },
          { type: "text", text: PROMPT_LECTURA },
        ],
        ESQUEMA_LECTURA
      );
      return json(r);
    }

    if (body.accion === "elegir") {
      const lista = (body.candidatos || [])
        .slice(0, 20)
        .map((c) => `- ${c.articulo} | ${c.descripcion} | lotes: ${(c.lotes || []).join(", ")} | caducidades: ${(c.caducidades || []).join(", ")}`)
        .join("\n");
      const r = await llamar(
        [
          {
            type: "text",
            text: `Datos leídos de la etiqueta de una caja:
${JSON.stringify(body.lectura)}

Artículos candidatos del almacén (código | descriptivo | lotes en stock | caducidades):
${lista}

¿Qué artículo de la lista es la caja? Los descriptivos del almacén suelen estar abreviados, en mayúsculas o en otro idioma que la etiqueta.
Si el lote o la caducidad coinciden con un candidato, es una prueba fuerte. Si ninguno encaja con seguridad, deja "articulo" vacío.`,
          },
        ],
        ESQUEMA_ELECCION
      );
      return json(r);
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: mensajeError(e) }, 502);
  }
};

export const config = { path: "/api/escanear" };
