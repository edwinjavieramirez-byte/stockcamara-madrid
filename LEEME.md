# Buscador de artículos

App web para móvil (Chrome Android) que:

1. Carga los Excel de **stock**, **maestro de picking** y **ubicaciones vacías** (se guardan solo en el móvil).
2. **Escanea** la etiqueta de una caja con una foto y te dice qué artículo es, cuál es su picking y cuántas cajas hay en stock: en picking, en reserva y en qué ubicaciones.
3. **Descargas:** carga el PDF del listado de pedidos de compras del día y te dice en qué picking va cada artículo, para imprimirlo.
4. Saca un **informe**: cajas fuera de su picking y adónde llevarlas, pickings mezclados, y pickings sin su artículo (con palets de reserva para reponer).

La antigua pestaña **Movimientos** (anotar movimientos desde el móvil para el responsable) se ha quitado porque ya no se usa.

## Archivos

| Archivo | Qué es |
|---|---|
| `public/index.html` | La app entera (pantalla, lectura de Excel, informe, cotejo) |
| `public/traspaso.html` | Cálculo de bases para los traspasos entre almacenes |
| `netlify/functions/escanear.mjs` | La función que llama a Claude con la foto (guarda tu clave de la API) |
| `netlify/functions/movimientos.mjs` | La función de los antiguos movimientos. La app ya no la usa (solo envía lo que a un móvil le quedase pendiente de antes); se puede quitar más adelante |
| `netlify/functions/base.mjs` | La función de la base compartida (Excel de cada almacén y asignaciones de picking) |
| `netlify.toml`, `package.json` | Configuración de Netlify |

## Subirlo a Netlify

1. En GitHub crea un repositorio **privado** nuevo (por ejemplo `stockcamara-madrid`) y, con **Add file → Upload files**, arrastra **el contenido** de la carpeta `para-subir` (las carpetas `public` y `netlify` y los archivos `netlify.toml` y `package.json`). No subas `documentos` ni ningún Excel.
2. La app está publicada en el proyecto de Netlify **appfotoalmacengarcimar**, conectado al repositorio. Cada subida a GitHub la publica sola. No hace falta tocar la configuración de compilación: la coge de `netlify.toml`.
3. En **Project configuration → Environment variables** añade:
   - `CLAUDE_API_KEY`: tu clave de la API de Claude. Márcala como secreta y que esté disponible para **Functions**. No uses el nombre `ANTHROPIC_API_KEY`: Netlify puede poner ahí la credencial de su propia pasarela de IA.
   - `APP_CODE`: uno o varios códigos separados por comas, uno por móvil (por ejemplo `movil1-k8f2,movil2-p3x9`). Sin él, cualquiera que tenga el enlace podría gastar tu API. Para anular un móvil, quita su código de la lista y vuelve a desplegar. Lo que va antes del primer guion es el nombre del móvil (`movil1`); usa un nombre que no sea secreto.
   - `APP_CODE_RESPONSABLE`: tu código (por ejemplo `jefe-z1m7`), distinto de los anteriores. Solo el móvil u ordenador que lo tenga carga los Excel en **Datos** y ve las pestañas **Pickings** y **Traspaso**. También sirve para escanear.
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
- **Operarios:** no cargan nada ni pueden cambiar los niveles, pero sí elegir almacén.
- **Actualización:** cada dispositivo comprueba si hay cambios al abrir la app, al volver a ella y cada 5 minutos con ella abierta. También puede hacerlo con **Comprobar ahora**. Solo descarga lo que haya cambiado.
- **Sin cobertura:** se sigue trabajando con la última copia guardada.
- **Asignaciones de picking:** las hechas desde cualquier móvil llegan a todos, y necesitan conexión.
- **Dónde están los datos:** stock, maestro y ubicaciones se guardan en Netlify Blobs, protegidos por los códigos de acceso. Los alias aprendidos siguen siendo de cada móvil.

## Escanear: qué artículo es, su picking y su stock

1. Haz la foto de la etiqueta (o busca a mano). La app dice qué artículo es y su picking. Si has escrito la ubicación donde estás, te dice si está en su sitio.
2. Debajo sale el **stock** del artículo: total de cajas, cuántas en **picking** y cuántas en **reserva**, y la lista de ubicaciones con sus cajas, UA, lotes y la caducidad más próxima. Primero su picking, luego el resto de picking y después la reserva (la playa sale como «Playa»).
3. Si alguna UA tiene la **situación 505 (caducado)**, se avisa en rojo arriba y en su ubicación.
4. **Ver cada UA** abre la tabla de todas las UA del artículo.

## Descargas: el listado de pedidos con su picking

Pestaña **Descargas**, para todos.

1. Carga el PDF del **Listado pedidos de compras** tal como sale del sistema. Se lee el texto del PDF en el propio dispositivo, sin IA y sin coste. La primera vez necesita conexión para descargar el lector de PDF.
2. Sale el mismo listado, **separado por proveedor y pedido** como el original (proveedor, serie/pedido, ref., fecha, divisa; y de cada artículo: código, descripción, entrega, ud. pedidas, ud. pendientes, precio, % dto., precio neto, importe y el total del pedido), con una columna más: **Picking**, la ubicación del maestro del almacén elegido. Si un artículo no tiene picking, sale «SIN PICKING».
3. **Imprimir** saca el documento en A4 (también se puede guardar como PDF). En el móvil, la pantalla solo enseña las columnas principales; al imprimir salen todas.
4. **Excel** saca lo mismo en una hoja.

- **Comprobación:** en cada pedido, las unidades de los artículos tienen que sumar su «TOTAL PEDIDO». Si no cuadran, o si hay artículos sin una cabecera de PROVEEDOR delante, el pedido sale con un aviso naranja para revisarlo en el original, y nunca se mezcla con el del proveedor anterior. Los códigos de proveedor pueden llevar letras (p. ej. W999).
- El listado se queda guardado en ese dispositivo hasta que cargues otro o pulses **Quitar el listado**. Un listado cargado con una versión anterior de la app hay que volver a cargarlo para que se lea con la nueva.
- Si cambias de almacén, el picking se busca en el maestro del almacén nuevo.

## Stock caducado (situación 505)

- La situación **505** del Excel de stock es **caducado**. Si el Excel trae además una columna con el texto de la situación o una columna «Caducado», al cargarlo se puede indicar como «Descripción situación / Caducado».
- No tiene apartado propio en el Informe: la app lo tiene en cuenta y avisa en rojo cuando se encuentra con él, al escanear (en el total y en su ubicación) y en las sugerencias de reposición.

## Pickings con más de un artículo

Pestaña **Pickings**, solo con el código de responsable (antes era la herramienta suelta `Pickings_multi_articulo.html`). No hay que cargar nada más: usa el **maestro de picking** y el **stock** del almacén elegido que ya están en **Datos**.

1. Muestra cada ubicación de picking que el maestro asigna a **más de un artículo** (incluye las asignaciones hechas desde la app). Las de 3 o más artículos salen en rojo. Si el código de una ubicación tiene otra longitud que la mayoría, se avisa.
2. Con el stock cargado, debajo de cada artículo sale **dónde hay stock en ubicaciones de picking** (las de altura no cuentan, según los niveles de picking de Ajustes) y cuántas cajas. En verde oscuro, si es el mismo picking.
3. **✓ Hecho** lo pasa a la lista de **Hechos** con la fecha; **Deshacer** lo devuelve. Si en un maestro nuevo cambian los artículos de ese picking, vuelve a pendientes solo.
4. Buscador (picking, artículo, descripción o ubicación de stock), orden por picking o por número de artículos, **Exportar a Excel** (hojas Detalle y Resumen) e **Imprimir**.

- **Diferencia con el Informe:** «Pickings con problemas» del Informe mira el **stock** (cajas de varios artículos en un picking). Esta pestaña mira el **maestro** (un picking asignado a varios artículos).
- **Dónde están los datos:** los «Hechos» se guardan solo en ese dispositivo.
- **Coste:** ninguno.

## Ubicaciones libres

Pestaña **Libres**, para todos (operarios y responsable). Antes era la herramienta suelta «Ubicaciones libres». No hay que cargar nada más: usa el **Excel de ubicaciones vacías** y el **maestro de picking** del almacén elegido, los mismos de **Datos** que el responsable comparte con todos.

1. Saca las ubicaciones de **picking** que están **vacías y no tienen ningún artículo asignado** en el maestro (incluidas las asignaciones hechas desde la app), agrupadas por fila y nivel (suelo 01, altura 02). La reserva y la playa nunca salen. Qué es picking lo dice la columna de tipo del Excel de vacías; si no la trae, los niveles de picking de Ajustes.
2. Se puede quitar un nivel con su casilla.
3. Tocar una ubicación copia su código para el sistema (con el 99 delante).
4. **PDF para imprimir:** hoja A4 con casillas para marcar, igual que la de la herramienta original (`ubicaciones_libres_08_DDMM.pdf`). La primera vez descarga el generador de PDF, así que necesita conexión.

- **Ubicaciones mal escritas en el maestro** (que no tienen el formato `AA-FF-HHH-NN-1`): salen en un aviso amarillo con su artículo. Esos artículos no cuentan como asignados, así que si su picking real está vacío saldrá como libre. Hay que corregirlo en el maestro.
- **Con stock:** si el Excel de stock dice que una vacía sin asignar tiene mercancía, no sale como libre y se avisa aparte, porque alguno de los dos Excel está desfasado.
- **Ceros perdidos:** si Excel guarda una ubicación como número (807023011 en vez de 0807023011), al cargarla se le devuelve el cero.
- **Coste:** ninguno.

## Traspaso por bases

Página `public/traspaso.html` (en la app: pestaña **Traspaso**, o **Datos → Calcular bases de un traspaso**). Sirve para preparar lo que pide otro almacén enviando bases completas, siempre igual o más de lo pedido. No usa fotos ni la IA: todo sale de la ficha técnica y del stock.

1. **Pedido:** un Excel con la **referencia** y lo que se pide, en **kilos**, en **cajas** o las dos cosas. Se leen **todas las hojas** del libro (p. ej. PRIORITARIOS, Picking, PALETS); se puede quitar alguna con su casilla. La unidad puede venir en una columna **Tipo**: CJ (cajas), KG, UD (unidades) o PAL/PALET (palets completos). Si la columna **Cantidad** trae la unidad en la celda («20 CJ», «150 KG»), se reconoce sola; también vale con la unidad en otra columna (UM) o con columnas separadas de Kilos y Cajas. Si hay cantidades sin unidad, la página pregunta en qué están. Si una referencia viene de las dos formas, se suman. Las filas con otra unidad (BOL…) no se cuentan y se avisa. Hay una plantilla en la propia página.
2. **Ficha de bases** (por código): **cajas por base**, bases por palet y kg por caja.
   - Se importa de la **ficha técnica** en Excel. Vale directamente el Excel de la **cadena logística** del sistema (cadloga): «Cajas por Fila» = cajas por base, «Filas por Palet» = bases por palet; de Consumo → Sobreembalaje (UD, CONVERS_U_SOB) → Distribución (CJ, CONVERS_U_DIS) salen los kg por caja, las unidades por caja y si el bulto es caja (CJ) o unidad (UD, p. ej. hielo o bandejas sueltas). Si un artículo tiene varias cadenas con cajas por fila, vale la de «Fecha Ultima Modificación» más reciente. Si no tiene ninguna con cajas por fila, el kg por caja sale de la más reciente en KG o UD (la de KN, 1 × 1, no se usa). De la cadena también sale la **descripción** de cada artículo, que aparece en la lista de la pestaña, en el Excel y en la hoja de traspaso; si la ficha se importó sin descripciones, la página avisa para volver a importarla. Un «nombre» que es el propio código (por ejemplo, si en el pedido se elige la columna del artículo como Descripción) no vale: se ignora en la página y el servidor no lo guarda. Si la ficha trae cajas por palet y capas por palet, las cajas por base salen de dividirlas, solo si la división es exacta.
   - Si cambia el formato de un artículo, se busca en **Buscar una referencia** y se cambian sus cajas por base. Se guarda quién lo cambió: «Ficha técnica» o «Cambiada a mano», con la fecha.
   - Las cajas por base nunca se adivinan: si una referencia no las tiene, sale en rojo.
   - **Kg por caja:** el de la ficha. Si la ficha no lo tiene, el del Excel de stock (Peso ÷ Cajas; media si es de peso variable).
3. **Cálculo:** cajas necesarias = kilos ÷ kg por caja (hacia arriba) + unidades ÷ unidades por caja (hacia arriba) + cajas pedidas + palets × bases por palet × cajas por base; bases = cajas necesarias ÷ cajas por base (hacia arriba). Con las bases por palet dice también cuántos palets completos salen.
4. **Barcelona envía y Madrid pide:** es lo que sale por defecto (se puede cambiar para un caso suelto). Con el stock de Barcelona se comprueba si hay cajas suficientes (situación 100). Para eso, el responsable tiene que cargar el Excel de stock de Barcelona en la app (elegir Barcelona → Datos). Si un artículo no está en el stock de Barcelona, el kg por caja se saca del de Madrid.
5. **Pasar al sistema:** se elige el almacén que pide, el nº de pedido (opcional) y si la cantidad va en cajas (CJ) o en kilos (KG).
   - **Excel para el sistema:** sale con el **mismo formato que el Excel con el detalle** (punto 6): una hoja por cada hoja del pedido, lo pedido por palets en una hoja aparte y solo cuatro columnas (Artículo, Descriptivo, Cajas pedidas o Palets pedidos, y Cajas para el pedido). Si se elige **kilos**, la última columna es **Kilos para el pedido**. Las referencias que no se pueden calcular en bases (les falta un dato de la ficha, p. ej. cajas por base, o el kg por caja si es en kilos) salen «Sin calcular» con el motivo. El nombre del archivo lleva los almacenes, la fecha y el nº de pedido.
   - **Hoja de traspaso:** documento para imprimir o guardar en PDF, con las bases y cajas de cada material, casilla de «Preparado» y firmas, agrupado por hoja del pedido. Las que van con lo pedido salen en naranja con su cantidad original. En la hoja de traspaso, las que no se pueden calcular en bases sí van con la cantidad del pedido, marcadas «Va lo pedido».
   - En cuanto se completan las cajas por base de una de esas referencias, pasa a ir en bases. En kilos, los de peso variable son aproximados: mejor en cajas.
6. **Excel con el detalle:** solo cuatro columnas, **Artículo**, **Descriptivo**, **Cajas pedidas** y **Cajas para el pedido**. Va una hoja por cada hoja del pedido (si el pedido tiene una sola, se llama «Cajas») y lo que se pide **por palets** va siempre en una hoja aparte: la PALETS del pedido si la tiene, y si no, «Palets», con la columna **Palets pedidos** en lugar de Cajas pedidas. Si lo pedido viene en kilos o mezclado, la columna de lo pedido lo dice en texto («150 kg»). Si una referencia no se puede calcular, en Cajas para el pedido sale «Sin calcular» con el motivo. **Imprimir** saca la tabla completa.

- **Solo el responsable:** la pestaña **Traspaso** solo aparece con el código de responsable. Si otro móvil abre el enlace, la página sale bloqueada, y el servidor solo da y guarda la ficha con ese código. La ficha es común a todos los almacenes (Netlify Blobs). Cada cambio se guarda referencia a referencia, así que importar una ficha no borra lo que ya había de otras referencias.
- **Dónde están los datos:** el Excel del pedido no sale del equipo; solo se comparte la ficha.
- **Varios equipos (Mac, HP del trabajo…):** cada uno guarda una copia de la ficha y la pone al día con la compartida al abrir la página. Debajo de «Ficha de bases» sale la huella: fecha de la ficha compartida, cuántas referencias tienen nombre y versión de la página. Si dos equipos no dicen lo mismo, hay que recargar la página o pulsar **Volver a bajar la ficha compartida**. Si un equipo tiene nombres de artículo que faltan en la compartida, los sube solo, sin cambiar el origen del dato. Hay que cambiar `VERSION_PAGINA` en `traspaso.html` en cada versión nueva.
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
- **Playa**: por defecto `013, 014, 017`. Las ubicaciones cuyo código empieza así (en Barcelona, las filas 30-39, 40-49 y 70-79, que no están en ningún pasillo) son siempre **reserva**, desde el suelo hasta el nivel 06, aunque el sistema diga otra cosa. Como el código empieza por el almacén (01), no afecta a Madrid ni a Málaga. Se cambia en **Ajustes** (solo el responsable) y se comparte con todos.
- Situación `100` = disponible; `505` = caducado. Los palets de reserva con otra situación aparecen marcados en rojo en las sugerencias de reposición.

## Coste

Unos 1–1,5 céntimos por foto con Sonnet 5.5. La pestaña Ajustes muestra cuántas llamadas y cuánto llevas gastado este mes desde ese móvil.

**Dispositivos y coste de todos (solo el responsable).** En Ajustes → Escaneo con IA, el botón **Ver dispositivos y coste de todos** enseña:

- cuántos dispositivos usan la app (los que se han conectado en los últimos 30 días);
- el coste de la IA de este mes sumando todos los dispositivos, y el del mes anterior;
- una lista con cada dispositivo: nombre del código (`movil1`, `Responsable`…), tipo de equipo (iPhone, Android…), almacén, último uso, llamadas y coste del mes.

Cómo se cuenta: cada dispositivo se inventa al instalar la app un identificador al azar que no dice nada de él. El servidor anota cuándo se conecta cada uno y lo que gasta cada foto (en Netlify Blobs, almacén `uso`). Del código de acceso solo se guarda el nombre (la parte antes del guion), nunca el código entero. Se empieza a contar desde que se sube esta versión: lo de antes solo estaba en cada móvil. Si un móvil reinstala la app o borra sus datos, sale como dispositivo nuevo. El coste es aproximado; la factura exacta está en la consola de Anthropic.
