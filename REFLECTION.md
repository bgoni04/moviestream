# REFLECTION.md — MovieStream MongoDB

## 1. Volviendo a empezar

Si rediseñara el modelo desde cero, cambiaría una sola cosa grande: **no denormalizaría `movie_title` dentro de `watch_history`**.

Al inicio pensé que era una optimización obvia — el historial de "continuar viendo" no necesita hacer lookup al cargar. Y funcionó. Pero en el momento en que una película cambia de título (un error tipográfico en el seeding, por ejemplo), el dato queda desincronizado silenciosamente. En el modelo relacional eso es imposible por definición.

Lo que me faltaba al inicio era entender que la denormalización no es gratis — es una deuda que pagas en mantenimiento. La información que descubrí escribiendo queries fue esta: **en MongoDB, cada campo denormalizado es una invariante que tú mismo tienes que hacer cumplir**, y eso es código adicional en cada operación de escritura.

También hubiera puesto índices desde el principio. Los agregué tarde y solo cuando empecé a escribir las queries de filtro por género que escaneaban toda la colección.

---

## 2. La conversación con el modelo

La operación que se sintió más forzada fue **"mostrar los ratings de un usuario con el título de cada película"**.

En SQL habría sido:
```sql
SELECT r.score, r.review, m.title
FROM ratings r
JOIN movies m ON r.movie_id = m.id
WHERE r.user_id = :id
ORDER BY r.created_at DESC
```

En MongoDB, con el modelo que tengo, tuve que:
1. Fetch de todos los ratings del usuario (`Rating.find({ user_id })`)
2. Extraer los `movie_id` de esos resultados
3. Fetch de las películas por esos ids (`Movie.find({ _id: { $in: movieIds } })`)
4. Construir un mapa en memoria y enriquecer los ratings manualmente

Eso es código que en SQL no existe. ¿Era inherente a NoSQL? Parcialmente. Un `$lookup` en un aggregation pipeline habría resuelto esto sin los pasos manuales en el servidor. Pero también fue una consecuencia de **cómo modelé**: si hubiera guardado `movie_title` en cada rating (más denormalización), el paso 2 y 3 desaparecen. Hay un trade-off real: ¿prefieres más código en el servidor o más datos duplicados en la base? No hay respuesta correcta universal.

---

## 3. La pregunta honesta

Para MovieStream específicamente, **SQL habría sido igual o mejor**.

Mi argumento: el dominio tiene relaciones muchos-a-muchos reales, bien definidas, y datos que cambian de forma independiente (géneros, actores, calificaciones). Eso es exactamente lo que el modelo relacional maneja mejor por construcción.

Lo que MongoDB me dio fue:
- Embeber géneros en películas → una lectura más rápida en la pantalla principal
- Embeber historial en usuarios → historial de "continuar viendo" sin JOIN

Lo que me costó:
- Mantener consistencia manual en datos denormalizados
- Escribir aggregation pipelines para lo que habría sido un JOIN de dos líneas
- Manejar el caso de "borrar género usado en películas" con lógica de aplicación, no con una FK constraint

La teoría dice que NoSQL escala mejor y es más flexible para esquemas cambiantes. Eso es verdad en contextos de alta escritura o documentos heterogéneos. Pero MovieStream no es Twitter — el volumen no justifica la complejidad adicional, y el esquema es bastante estable.

Si tuviera que elegir hoy para un proyecto real: usaría **PostgreSQL con JSONB** para campos realmente variables, y relaciones normales para todo lo demás. MongoDB brillaría si el dominio fuera más orientado a documentos (e.g., cada película tuviera una estructura de metadata completamente distinta, o si los géneros tuvieran decenas de atributos que varían por película).
