# Buscador de artículos

App web para móvil (Chrome Android) que:

1. Carga los Excel de **stock**, **maestro de picking** y **ubicaciones vacías** (se guardan solo en el móvil).
2. Saca un **informe**: cajas fuera de su picking y adónde llevarlas, pickings mezclados y pickings sin su artículo (con palets de reserva para reponer).
3. **Escanea** la etiqueta de una caja con una foto y te dice qué artículo es, cuál es su picking y si la ubicación donde estás es la correcta.
4. **Comparte los movimientos**: lo que anota cada móvil le aparece en unos 10 segundos al responsable, en la pestaña **Movimientos**, para registrarlo en el sistema del almacén.

## Archivos

| Archivo | Qué es |
|---|---|
| `public/index.html` | La app entera (pantalla, lectura de Excel, informe, cotejo) |
| `public/traspaso.html` | Cálculo de bases para los traspasos entre almacenes |
| `netlify/functions/escanear.mjs` | La función que llama a Claude con la foto (guarda tu clave de la API) |
| `netlify/functions/movimientos.mjs` | La función que guarda los movimientos de todos los móviles en Netlify Blobs y se los da al responsable |
| `netlify.toml`, `package.json` | Configuración de Netlify |

## Subirlo a Netlify

1. En GitHub crea un repositorio **privado** nuevo (por ejemplo `stockcamara-madrid`) y, con **Add file → Upload files**, arrastra **el contenido** de la carpeta `para-subir` (las carpetas `public` y `netlify` y los archivos `netlify.toml` y `package.json`). No subas `documentos` ni ningún Excel.
2. La app está publicada en el proyecto de Netlify **appfotoalmacengarcimar**, conectado al repositorio. Cada subida a GitHub la publica sola. No hace falta tocar la configuración de compilación: la coge de `netlify.toml`.
3. En **Project configuration → Environment variables** añade:
   - `CLAUDE_API_KEY`: tu clave de la API de Claude. Márcala como secreta y que esté disponible para **Functions**. No uses el nombre `ANTHROPIC_API_KEY`: Netlify puede poner ahí la credencial de su propia pasarela de IA.
   - `APP_CODE`: uno o varios códigos separados por comas, uno por móvil (por ejemplo `movil1-k8f2,movil2-p3x9`). Sin él, cualquiera que tenga el enlace podría gastar tu API. Para anular un móvil, quita su código de la lista y vuelve a desplegar. Lo que va antes del primer guion es el nombre con el que salen sus movimientos (`movil1`); usa un nombre que no sea secreto.
   - `APP_CODE_RESPONSABLE`: tu código (por ejemplo `jefe-z1m7`), distinto de los anteriores. Solo el móvil u ordenador que lo tenga ve la pestaña **Movimientos** También sirve para escanear y anotar. Sin esta variable nadie puede ver los movimientos.
4. Para que el móvil pueda abrirla sin iniciar sesión en Netlify, en **Project configuration → General → Visitor access** la protección debe quedar solo para los despliegues que no son de producción (como en la bitácora y la calculadora).
5. Vuelve a desplegar (**Deploys → Trigger deploy**).
6. En la consola de Anthropic (**Settings → Limits**) pon un límite de gasto mensual de 50 $ para que nunca se pase.
7. En cada móvil, abre la web, ve a **Ajustes** y escribe su código. La app lo comprueba con el servidor y, una vez guardado, ya no se muestra: solo se puede cambiar escribiendo antes el código actual.
8. Instálala como una app más: en **iPhone**, Safari → botón Compartir → **Añadir a pantalla de inicio**; en **Android**, Chrome → menú ⋮ → **Añadir a pantalla de inicio**.

Opcional: `CLAUDE_MODEL` para cambiar el modelo (por defecto `claude-sonnet-5-5`; `claude-haiku-5-5` es más de 10 veces más barato pero lee peor).

## Base compartida

Al entrar en la app se elige el almacén (Madrid, Barcelona, Málaga). Se puede cambiar en cualquier momento tocando su nombre, arriba a la derecha. Para añadir otro, se añade su código a `ALMACENES` en `public/index.html`.

Cada almacén tiene su propia base. El responsable elige el almacén y carga sus Excel desde **Datos**, y todos los dispositivos que trabajen en ese almacén reciben esa misma versión. Los niveles de picking son comunes a todos.

- **Primera vez:** con el código de responsable, en **Datos**, pulsa **Compartir con todos lo de este dispositivo**. Hasta entonces cada dispositivo sigue con lo que tenga.
- **Base anterior:** la que ya estaba compartida sigue siendo la de Madrid.
- **Excel equivocado:** si un Excel no tiene ubicaciones del almacén elegido, no se guarda. Si tiene menos de la mitad, la app pregunta antes (salvo el de vacías, que trae todos los almacenes).
- **Movimientos:** cada almacén ve los suyos. Si hay pendientes en otro, se avisa en la pestaña **Movimientos**.
- **Operarios:** no cargan nada ni pueden cambiar los niveles, pero sí elegir almacén.
- **Actualización:** cada dispositivo comprueba si hay cambios al abrir la app, al volver a ella y cada 5 minutos con ella abierta. También puede hacerlo con **Comprobar ahora**. Solo descarga lo que haya cambiado.
- **Sin cobertura:** se sigue trabajando con la última copia guardada.
- **Asignaciones de picking:** las hechas desde cualquier móvil llegan a todos, y necesitan conexión.
- **Dónde están los datos:** stock, maestro y ubicaciones se guardan en Netlify Blobs, protegidos por los códigos de acceso. Los alias aprendidos siguen siendo de cada móvil.

## Cómo se comparten los movimientos

1. El operario pulsa **Anotar movimiento**. No hace falta que indique de dónde salen las cajas: si tiene escrita su ubicación se envía también, y si no, se envía sin ella.
2. El responsable lo ve en **Movimientos → Movimientos por hacer**: artículo, cajas, lote, caducidad y picking. Un toque en cualquier dato lo copia.
3. Al pulsar **Hecho**, pasa a **Movimientos hechos**. **Deshacer** lo devuelve a la otra zona.

- **Sin cobertura:** el movimiento se queda en el móvil como «Pendiente de enviar» y sale solo al volver la señal.
- **Borrados:** si el operario borra un movimiento por hacer, desaparece. Si ya estaba hecho, sigue en la lista con un aviso para revisarlo en el sistema. Lo anotado con otro código no se puede borrar desde su lista. El responsable puede borrar cualquiera con **✕** en **Movimientos**, y desaparece para todos.
- **Buscador:** en **Movimientos**, busca un artículo por código o nombre para ver a qué picking se ha llevado y cuántas cajas.
- **Dónde están los datos:** los movimientos (artículo, lote, caducidad, cajas, UA) se guardan en Netlify Blobs.
- **Consumo:** solo se consulta cada 10 segundos mientras la pestaña está a la vista. Cada despliegue gasta 15 créditos, así que sube los cambios de una vez.

## Traspaso por bases

Página `public/traspaso.html` (en la app: pestaña **Traspaso**, o **Datos → Calcular bases de un traspaso**). Sirve para preparar lo que pide otro almacén enviando bases completas, siempre igual o más de lo pedido. No usa fotos ni la IA: todo sale de la ficha técnica y del stock.

1. **Pedido:** un Excel con la **referencia** y lo que se pide, en **kilos**, en **cajas** o las dos cosas. Se leen **todas las hojas** del libro (p. ej. PRIORITARIOS, Picking, PALETS); se puede quitar alguna con su casilla. La unidad puede venir en una columna **Tipo**: CJ (cajas), KG, UD (unidades) o PAL/PALET (palets completos). Si la columna **Cantidad** trae la unidad en la celda («20 CJ», «150 KG»), se reconoce sola; también vale con la unidad en otra columna (UM) o con columnas separadas de Kilos y Cajas. Si hay cantidades sin unidad, la página pregunta en qué están. Si una referencia viene de las dos formas, se suman. Las filas con otra unidad (BOL…) no se cuentan y se avisa. Hay una plantilla en la propia página.
2. **Ficha de bases** (por código): **cajas por base**, bases por palet y kg por caja.
   - Se importa de la **ficha técnica** en Excel. Vale directamente el Excel de la **cadena logística** del sistema (cadloga): «Cajas por Fila» = cajas por base, «Filas por Palet» = bases por palet; de Consumo → Sobreembalaje (UD, CONVERS_U_SOB) → Distribución (CJ, CONVERS_U_DIS) salen los kg por caja, las unidades por caja y si el bulto es caja (CJ) o unidad (UD, p. ej. hielo o bandejas sueltas). Si un artículo tiene varias cadenas con cajas por fila, vale la de «Fecha Ultima Modificación» más reciente. Si no tiene ninguna con cajas por fila, el kg por caja sale de la más reciente en KG o UD (la de KN, 1 × 1, no se usa). De la cadena también sale la **descripción** de cada artículo, que aparece en la lista de la pestaña, en el Excel y en la hoja de traspaso; si la ficha se importó sin descripciones, la página avisa para volver a importarla. Si la ficha trae cajas por palet y capas por palet, las cajas por base salen de dividirlas, solo si la división es exacta.
   - Si cambia el formato de un artículo, se busca en **Buscar una referencia** y se cambian sus cajas por base. Se guarda quién lo cambió: «Ficha técnica» o «Cambiada a mano», con la fecha.
   - Las cajas por base nunca se adivinan: si una referencia no las tiene, sale en rojo.
   - **Kg por caja:** el de la ficha. Si la ficha no lo tiene, el del Excel de stock (Peso ÷ Cajas; media si es de peso variable).
3. **Cálculo:** cajas necesarias = kilos ÷ kg por caja (hacia arriba) + unidades ÷ unidades por caja (hacia arriba) + cajas pedidas + palets × bases por palet × cajas por base; bases = cajas necesarias ÷ cajas por base (hacia arriba). Con las bases por palet dice también cuántos palets completos salen.
4. **Barcelona envía y Madrid pide:** es lo que sale por defecto (se puede cambiar para un caso suelto). Con el stock de Barcelona se comprueba si hay cajas suficientes (situación 100). Para eso, el responsable tiene que cargar el Excel de stock de Barcelona en la app (elegir Barcelona → Datos). Si un artículo no está en el stock de Barcelona, el kg por caja se saca del de Madrid.
5. **Pasar al sistema:** se elige el almacén que pide, el nº de pedido (opcional) y si la cantidad va en cajas (CJ) o en kilos (KG).
   - **Excel para el sistema:** sale **igual que el pedido**: las mismas hojas (PRIORITARIOS, Picking, PALETS…), con sus columnas y en el mismo orden, pero con la cantidad ya ajustada a bases completas y el tipo de cada línea (CJ, o UD si el artículo se mueve por unidad; KG si se elige en kilos). Al lado del artículo se añade la **Descripción** (si el pedido ya trae esa columna, se rellena la suya) y a la derecha Bases, Cajas por base, Pedido original y Aviso. La descripción sale de la ficha técnica (cadena logística); si el artículo no está en ella, del Excel de stock de Barcelona o de Madrid. Las referencias que **no se pueden enviar en bases** (les falta un dato de la ficha, p. ej. cajas por base) no se quedan fuera: van con la **cantidad del pedido**, tal cual, marcadas «VA LO PEDIDO» con el motivo. Detrás van la hoja «Detalle» con bases y cajas; hoja «Van como en el pedido» con esas referencias y el motivo, y «Datos del traspaso» (almacenes, nº de pedido, fecha). Si una referencia sale en dos hojas del pedido, se calcula en cada una por separado.
   - **Hoja de traspaso:** documento para imprimir o guardar en PDF, con las bases y cajas de cada material, casilla de «Preparado» y firmas, agrupado por hoja del pedido. Las que van con lo pedido salen en naranja con su cantidad original.
   - En cuanto se completan las cajas por base de una de esas referencias, pasa a ir en bases. En kilos, los de peso variable son aproximados: mejor en cajas.
6. **Excel con el detalle** o **Imprimir** sacan la tabla completa.

- **Solo el responsable:** la pestaña **Traspaso** solo aparece con el código de responsable. Si otro móvil abre el enlace, la página sale bloqueada, y el servidor solo da y guarda la ficha con ese código. La ficha es común a todos los almacenes (Netlify Blobs). Cada cambio se guarda referencia a referencia, así que importar una ficha no borra lo que ya había de otras referencias.
- **Dónde están los datos:** el Excel del pedido no sale del equipo; solo se comparte la ficha.
- **Después de actualizar:** el responsable tiene que volver a cargar el Excel de stock de cada almacén para que se guarde la columna Peso.
- **Coste:** ninguno.

## Cómo decide qué artículo es

1. **Código de barras** de la foto (gratis, lo lee el propio móvil). Si es la UA/SSCC y está en el stock, ya está.
2. Si no, **Claude lee la etiqueta**: nombre en cada idioma, lote, caducidad y EAN.
3. Se compara con los descriptivos del Excel. Si el **lote coincide** o el nombre se parece claramente, ya está.
4. Si hay dudas, Claude elige entre los 15 artículos más parecidos (segunda llamada, solo texto, muy barata).
5. Cuando pulsas **"Es correcto"**, el nombre de la etiqueta se guarda como alias y la próxima vez se reconoce sin dudar.

## Ajustes importantes

- **Formato de ubicación**: `AA-FF-HHH-NN-1` (almacén-fila-hueco-nivel), con o sin guiones. El 1 final es fijo en todas las ubicaciones y no significa nada.
- **Dígitos del nivel**: solo para ubicaciones con otro formato: cuántos dígitos finales indican el nivel.
- **Niveles de picking**: por defecto `1,2`. El resto se considera reserva, salvo que el Excel de ubicaciones vacías indique otro tipo (algunos terceros de Barcelona son picking).
- Situación `100` = disponible. Los palets de reserva con otra situación aparecen marcados en rojo en las sugerencias de reposición.

## Coste

Unos 1–1,5 céntimos por foto con Sonnet 5.5. La pestaña Ajustes muestra cuántas llamadas y cuánto llevas gastado este mes desde ese móvil.
