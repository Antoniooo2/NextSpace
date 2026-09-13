# AI Advisor (Rony) - Documento de diseño

Este documento define la arquitectura antes de escribir código. La idea es que
Claude Code no tenga que tomar decisiones de diseño: solo implementar lo que ya
está decidido acá.

Todo identificador, clave JSON y texto de UI va en inglés. El documento está en
español porque es interno.

---

## 1. Alcance

**Lo que el advisor hace:**

- Lado business: recolecta criterios (presupuesto, tipo de negocio, zona,
  servicios), busca en la base real, y recomienda locales explicando por qué.
  Después de la primera búsqueda, chat libre para refinar o preguntar.
- Lado owner: analiza su propia cartera (ocupación, mora, contratos por vencer,
  calidad de listings) y prioriza qué atender primero. Puede reescribir
  descripciones de propiedades.
- Ambos: gráficas calculadas desde Supabase, comentadas por el modelo.

**Lo que el advisor NO hace, y el prompt debe prohibir explícitamente:**

- Inventar precios de mercado de El Salvador. Ese dato no está en la base.
- Dar cifras que no vengan del contexto que le pasamos.
- Escribir en la base de datos. Solo lee y aconseja.
- Predicciones a más de 3 meses. No hay histórico que las sostenga.

Cuando compara, debe declarar el tamaño de la muestra: "según 3 propiedades
similares en la plataforma", no "el precio de mercado es X".

---

## 2. Decisión clave: quién busca

El modelo **no** busca propiedades. El modelo traduce lenguaje natural a un
filtro estructurado; **el código** consulta Supabase; el modelo después comenta
los resultados reales.

Si el modelo "buscara", se inventaría las propiedades. Con este reparto, todo
lo que se muestra en pantalla existe en la base.

---

## 3. Flujo

### Lado business (mixto)

El formulario **no es una pantalla aparte**. Es el primer mensaje de Rony,
renderizado como burbuja dentro del chat. Nunca se sale del chat.

```
  +--------------------------------------------------+
  | (R) Hi Ruben. I can help you find a space.       |
  |                                                  |
  | (R) +-------------------------------------+      |
  |     | Tell me what you are looking for.   |      |
  |     | Budget    [400 ]  Type  [Cafe   v]  |      |
  |     | Dept   [La Lib v] Muni  [S.Tecla v] |      |
  |     | Services  (Parking)(Internet)...    |      |
  |     |          [ Find spaces ]            |      |
  |     +-------------------------------------+      |
  +--------------------------------------------------+
                        |
                        v  al enviar, la burbuja
                           colapsa a una pastilla
  +--------------------------------------------------+
  | [~] Cafe/Restaurant  Santa Tecla  up to $400     |
  |                                       [ Edit ]   |
  |                                                  |
  | (R) Found 3 available spaces...                  |
  |     [card] [card] [card]                         |
  |                                                  |
  | (R) Local Plaza Merliot is the closest fit...     |
  +--------------------------------------------------+
                        |
                        v  desde acá, chat libre
  +--------------------------------------------------+
  | (yo) something cheaper                           |
  | (yo) why do you recommend that one?              |
  | (yo) what should I check before signing?         |
  +--------------------------------------------------+
```

**La pastilla del filtro es el estado visible.** Muestra siempre el filtro
vigente. Cuando el usuario dice "algo más barato" en el chat, la pastilla se
actualiza sola. Eso resuelve el problema de que el filtro sea un estado
invisible que el usuario no sabe en qué quedó.

El botón Edit vuelve a abrir el formulario, con los valores actuales cargados.
Es el mismo componente, así que el usuario siempre ve la misma cosa.

### Lado owner (sin formulario)

Abre directo con el análisis de su cartera y chips sugeridos. No hay nada que
preguntarle: sus datos ya están en la base.

```
  +-------------------------------------------+
  |  Rony: You have 5 properties, 3 occupied. |
  |  Two have been vacant for over 60 days,   |
  |  and both are missing photos.             |
  |                                           |
  |  [grafica de ocupacion]                   |
  |                                           |
  |  [ Why are they vacant? ]                 |
  |  [ Improve my listings ]                  |
  |  [ Who owes me money? ]                   |
  +-------------------------------------------+
```

---

## 4. Contrato JSON entre frontend y modelo

Esto es el centro del diseño. El modelo siempre responde JSON con esta forma:

```json
{
  "reply": "Texto que se muestra al usuario",
  "intent": "search",
  "filter": {
    "budget_max": 500,
    "budget_min": null,
    "property_type": ["Cafe/Restaurant"],
    "department": "La Libertad",
    "municipality": "Santa Tecla",
    "required_services": [1, 3]
  },
  "missing": ["budget_max"],
  "highlight": [12, 7],
  "chart": null
}
```

Campos:

| Campo | Tipo | Para qué |
|---|---|---|
| `reply` | string | Lo único que se renderiza como texto |
| `intent` | enum | `search`, `refine`, `explain`, `general`, `out_of_scope` |
| `filter` | object o null | Solo cuando `intent` es `search` o `refine` |
| `missing` | array | Qué datos le faltan para buscar bien |
| `highlight` | array de property_id | Cuál resultado destacar |
| `chart` | enum o null | Qué gráfica pedirle al código |

`intent` es lo que hace que no sea lineal:

- `search` / `refine`: el filtro cambió, hay que volver a consultar Supabase
- `explain`: pregunta sobre un resultado ya en pantalla, no hay que buscar
- `general`: duda que no depende de datos (qué revisar antes de firmar)
- `out_of_scope`: fuera de tema, responde que no puede ayudar con eso

---

## 5. Secuencia de llamadas

Una búsqueda cuesta **dos** llamadas al modelo. Una pregunta cuesta una.

```
  BUSQUEDA (intent search/refine)

  usuario -> [llamada 1: entender] -> filter
                                        |
                                        v
                              codigo consulta Supabase
                                        |
                                        v
                              resultados reales (o 0)
                                        |
                                        v
             [llamada 2: narrar] <------+
                       |
                       v
              reply + highlight -> pantalla


  PREGUNTA (intent explain/general)

  usuario -> [una sola llamada] -> reply -> pantalla
```

La llamada 1 recibe: system prompt, historial, filtro actual, mensaje nuevo.
Devuelve `intent`, `filter`, `missing`, y un `reply` provisional corto.

La llamada 2 recibe: los resultados reales de Supabase, qué se relajó del
filtro si aplica, y el filtro final. Devuelve el `reply` definitivo y
`highlight`.

Alternativa más barata: una sola llamada, pasándole los resultados de la
búsqueda anterior como contexto. El comentario queda un turno atrasado. No la
recomiendo, se nota.

---

## 6. Relajación del filtro

Cuando la búsqueda da 0 resultados, el código afloja el filtro por su cuenta,
en este orden, y registra qué aflojó:

1. Quitar `required_services` (los servicios son lo más negociable)
2. Quitar `municipality`, buscar en todo el `department`
3. Subir `budget_max` un 15 por ciento
4. Subir `budget_max` un 30 por ciento
5. Agregar `Other` a `property_type`

Se para en el primer paso que devuelva resultados. Lo que se relajó viaja a la
llamada 2 como `relaxed: ["municipality", "budget_max_15"]`, y el modelo
**tiene que decirlo** en el reply:

> Nothing available in Santa Tecla within $400. These three are in La Libertad
> at a slightly higher price.

Si después de los 5 pasos sigue en 0, el reply lo dice claro y sugiere guardar
la búsqueda o avisar cuando haya algo nuevo. No inventa alternativas.

---

## 7. Estado en el frontend

```js
{
  role: "business",           // o "property-owner"
  phase: "form",              // form | results | chat
  filter: { ... },            // filtro vigente
  relaxed: [],                // que se aflojo en la ultima busqueda
  results: [],                // propiedades reales de Supabase
  highlight: [],              // property_ids destacados
  messages: [],               // historial completo, va en cada request
  chart: null,
  loading: false,
  error: null
}
```

El historial se manda completo en cada request porque la API no tiene memoria.
Vive en estado de React, no en localStorage.

---

## 7.1 Guardar las conversaciones

Dos tablas nuevas.

```sql
create table advisor_conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  user_auth_id    uuid not null references auth.users(id) on delete cascade,
  title           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table advisor_messages (
  message_id      uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references advisor_conversations(conversation_id)
                  on delete cascade,
  role            text not null check (role in ('user','model')),
  content         text not null,
  payload         jsonb,
  created_at      timestamptz default now()
);
```

**`payload` es el campo que importa.** Guarda el snapshot de ese turno: los
resultados que se mostraron, el filtro vigente, qué se relajó, y los datos de
la gráfica.

Sin `payload`, al reabrir una conversación vieja aparece solo el texto y las
tarjetas de propiedades desaparecen. Y no se pueden recalcular, porque esa
propiedad quizás ya está ocupada o cambió de precio. Con el snapshot, el
historial queda coherente con lo que el usuario vio en su momento.

RLS: una policy `FOR ALL` con `user_auth_id = auth.uid()` en
`advisor_conversations`, y en `advisor_messages` scoped vía el
`conversation_id` del dueño. Mismo patrón que `saved_properties`.

**Título:** generarlo de las primeras palabras del primer mensaje del usuario,
no pedírselo. Si se quiere algo más prolijo, una llamada extra al modelo, pero
solo una vez por conversación.

**Límite de historial:** el historial se manda completo en cada request, así
que una conversación larga empieza a costar tokens y a tardar. Mandar los
últimos 20 mensajes como máximo. Si hace falta más contexto, resumir los viejos
en una sola línea de sistema. No mandar 50 mensajes nunca.

---

## 8. System prompts

### Business

```
You are Rony, an assistant inside NextSpace, a commercial real estate rental
marketplace in El Salvador. You help businesses find a commercial space to
lease.

You have access ONLY to the properties listed on this platform. You do not
know market prices in El Salvador and you must never state one. If you compare
prices, say how many platform listings the comparison is based on.

Never invent a property, a price, an address, or a statistic. If the data is
not in the context given to you, say you do not have it.

Your job each turn:
1. Decide the intent of the user's message.
2. If they are describing or adjusting what they need, produce a filter.
3. If they are asking about a result already on screen, explain it using only
   the data provided.
4. If they are asking general leasing questions, answer from your own
   knowledge without citing platform data.

Keep replies short. Two or three sentences unless they ask for detail.
Write in English.

Valid property_type values, use these exact strings:
Cafe/Restaurant, Store/Boutique, Beauty Salon, Pharmacy/Healthcare, Other

Respond only with JSON matching the given schema.
```

### Property owner

```
You are Rony, an assistant inside NextSpace, a commercial real estate rental
marketplace in El Salvador. You help property owners manage and improve their
listings.

You receive real statistics about this owner's portfolio. Use those numbers.
Never invent a number that is not in the context. You do not know market
prices in El Salvador and must never state one.

Your job is to tell the owner what deserves attention first and why. Prefer
one clear priority over a list of five. When a listing is incomplete (no
photos, short description, no services, missing municipality, no price), say
so plainly and offer to rewrite the description.

Keep replies short. Two or three sentences unless they ask for detail.
Write in English.

Respond only with JSON matching the given schema.
```

---

## 9. Queries de Supabase

Todas con el JWT del usuario, no con service_role, para que RLS haga su
trabajo.

### Búsqueda de propiedades (business)

```sql
select property_id, property_name, description, monthly_rent, property_type,
       department, municipality, address
from add_business
where availability = 'Available'
  and monthly_rent is not null
  and monthly_rent <= :budget_max
  and (:types is null or property_type = any(:types))
  and (:department is null or department = :department)
  and (:municipality is null or municipality = :municipality)
order by monthly_rent asc
limit 6;
```

Fotos vía `business_photos`, servicios vía la tabla junction.

### Estadísticas del owner

- Total de propiedades, y conteo por `availability`
- Contratos `Active` y `Pending`
- Pagos con status `Late`, y el monto total
- Contratos con `end_date` en los próximos 30 y 60 días
- Renta promedio de sus propiedades
- Por cada propiedad: si tiene fotos, largo de la descripción, cuántos
  servicios cargados, si tiene municipality y monthly_rent

Ese último punto alimenta la auditoría de listings, que es la función con mejor
relación esfuerzo/resultado.

### Gráficas

Los datos de las gráficas los calcula el código, nunca el modelo. El modelo
solo elige cuál mostrar vía el campo `chart`.

- `occupancy`: ocupadas vs disponibles vs reservadas
- `income_by_month`: suma de `payment.amount` con status `Paid` por mes
- `payment_status`: conteo por status de pago
- `budget_fit`: precio de cada resultado contra el presupuesto del usuario

---

## 10. Verificar antes de codear

Estas cosas hay que confirmar por SQL, no asumirlas:

1. **El nombre exacto de la columna del precio.** Se usa `monthly_rent` en el
   código actual. Confirmar.
2. **La llave de la tabla junction de servicios.** Confirmar si es
   `property_id` o `business_id`. Si es `business_id`, hay que entender a qué
   apunta antes de escribir el join.
3. **Si existe `add_business.property_name`.** El webhook lo usa, así que
   probablemente sí.
4. **Los valores exactos del CHECK de `property_type`.** Ver punto siguiente.
5. **Si `payment` tiene columna de monto** y cómo se llama, para la gráfica de
   ingresos.
6. **RLS de las tablas que el advisor va a leer.** `reviews` y `business`
   tenían RLS activo con cero políticas. Si el advisor las toca, se bloquea.

### Gotcha del acento

Un valor del CHECK de `property_type` lleva acento: `Café/Restaurant`. La regla
del proyecto es ASCII puro en el código, pero acá el string tiene que coincidir
carácter por carácter con la base o la query no matchea nunca y falla en
silencio.

Solución: definir los cinco valores en **un solo archivo constante**, por
ejemplo `src/lib/propertyTypes.js`, y que todo el resto del código importe de
ahí. Un solo lugar con el carácter no-ASCII, controlado.

---

## 11. Backend

Va en `api/advisor.js` como función serverless de Vercel, siguiendo el patrón
de `api/wompi/create-payment-link.js` que ya funciona. No como Edge Function de
Supabase: así todo el backend queda en un solo deploy y un solo panel de
secretos.

Requisitos:

- `GEMINI_API_KEY` como variable de entorno del servidor. **Nunca** con
  prefijo `VITE_`, porque eso se bundlea en el JS del cliente.
- Autenticación por JWT en el header, igual que create-payment-link. Sin
  sesión válida, 401. Si no, cualquiera consume la cuota.
- Salida estructurada: la API de Gemini soporta `responseMimeType:
  "application/json"` más un `responseSchema`. Usarlo. Garantiza JSON
  parseable y evita el parche de limpiar backticks a mano.
- Verificar en la documentación el nombre del modelo vigente de la capa
  gratuita antes de hardcodearlo.
- Rate limiting básico por usuario. La capa gratuita tiene límite de requests
  por minuto; si varios usan el advisor a la vez, choca.
- Nunca devolver un body vacío. Si Gemini falla o hace timeout, devolver JSON
  con un mensaje claro. Un body vacío revienta el `.json()` del cliente, que es
  exactamente el error que apareció con Wompi en dev.

---

## 12. Orden de implementación

1. **Backend mínimo.** `api/advisor.js` con auth, Gemini, schema estructurado y
   manejo de errores. Sin datos de Supabase todavía. Se prueba con curl.
2. **UI business.** Formulario, resultados, chat libre, tarjetas de propiedad.
   Con el backend del paso 1.
3. **Búsqueda real.** Las queries de `add_business`, la relajación de filtro, y
   la segunda llamada al modelo para narrar.
4. **Lado owner.** Estadísticas, auditoría de listings, reescritura de
   descripciones.
5. **Gráficas.** Calculadas en el código, elegidas por el modelo.

Cada paso deja algo que funciona. Se puede parar en el 3 y ya hay producto.
