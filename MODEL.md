# MovieStream — Modelo Documental MongoDB

## Punto de partida: el ERD relacional

El modelo relacional original tenía estas entidades y relaciones:

```
Genre (id, name)
Movie (id, title, year, description, duration_min)
Actor (id, name, birth_date, nationality)
User (id, username, email, created_at)
Movie_Genre (movie_id, genre_id)          — N:M
Movie_Actor (movie_id, actor_id, role)     — N:M con atributo
Rating (user_id, movie_id, score, date)    — N:M con atributos
WatchHistory (user_id, movie_id, watched_at, progress_pct) — N:M con atributos
```

---

## Decisiones de modelado

### 1. `movies` — colección principal

**Decisión: Embeber géneros, referenciar actores.**

Los géneros son catálogo pequeño (5–20 items) y se consultan siempre junto con la película. No tiene sentido hacer un lookup cada vez que se muestra una tarjeta. Se embeben como array de objetos `{ _id, name }`.

Los actores se *referencian* (array de `ObjectId`) porque:
- Un actor tiene su propia identidad (bio, filmografía)
- La lista puede ser larga (20+ por película)
- Se edita independientemente

El atributo `role` del elenco se guarda **en el documento de la película**, como array de objetos `{ actor_id, role }`, porque el rol pertenece a la relación película↔actor, no al actor en sí.

```json
{
  "_id": ObjectId("..."),
  "title": "Inception",
  "year": 2010,
  "description": "A thief who steals corporate secrets...",
  "duration_min": 148,
  "poster_url": "https://...",
  "genres": [
    { "_id": ObjectId("..."), "name": "Sci-Fi" },
    { "_id": ObjectId("..."), "name": "Thriller" }
  ],
  "cast": [
    { "actor_id": ObjectId("..."), "role": "Dom Cobb" },
    { "actor_id": ObjectId("..."), "role": "Arthur" }
  ],
  "avg_rating": 8.8,
  "rating_count": 1420,
  "created_at": ISODate("2024-01-01")
}
```

**avg_rating / rating_count** son campos denormalizados. Se actualizan al insertar/actualizar un rating. Permite mostrar la calificación promedio sin un `$lookup` + `$avg` en cada carga de página.

---

### 2. `genres` — colección de catálogo

**Decisión: Colección separada + embebido en películas.**

Mantener la colección aunque los géneros estén embebidos sirve para:
- Listar todos los géneros disponibles (formulario de búsqueda, dropdown)
- Editar el nombre de un género (luego se actualiza también en las películas con `updateMany`)

```json
{
  "_id": ObjectId("..."),
  "name": "Science Fiction",
  "slug": "sci-fi",
  "created_at": ISODate("2024-01-01")
}
```

**Trade-off aceptado:** si se renombra un género, hay que hacer un `updateMany` en `movies`. Para un catálogo estático esto es aceptable.

---

### 3. `actors` — colección de personas

**Decisión: Colección separada, referenciada desde `movies`.**

```json
{
  "_id": ObjectId("..."),
  "name": "Leonardo DiCaprio",
  "birth_date": ISODate("1974-11-11"),
  "nationality": "American",
  "bio": "...",
  "photo_url": "https://...",
  "created_at": ISODate("2024-01-01")
}
```

No se guarda la lista de películas aquí (referencia solo en una dirección: movie → actor). Para obtener la filmografía de un actor se hace un `find({ "cast.actor_id": actorId })` en `movies`.

---

### 4. `users` — colección de usuarios

**Decisión: Embeber historial reciente, referenciar ratings.**

El `watch_history` se embebe como array limitado a los últimos 50 items (con `$slice`). Los patrones de uso son: "muéstrame lo que vi recientemente" — consulta frecuente, sobre un solo usuario.

```json
{
  "_id": ObjectId("..."),
  "username": "jdoe",
  "email": "john@example.com",
  "created_at": ISODate("2024-01-01"),
  "watch_history": [
    {
      "movie_id": ObjectId("..."),
      "movie_title": "Inception",
      "watched_at": ISODate("2024-06-15"),
      "progress_pct": 100
    }
  ]
}
```

`movie_title` está denormalizado dentro del historial para no hacer lookup al renderizar la lista de "continuar viendo".

---

### 5. `ratings` — colección de calificaciones

**Decisión: Colección separada.**

Los ratings no se embeben en el usuario ni en la película porque:
- Pueden ser miles por película
- Se consultan de forma independiente (¿calificó este usuario esta película?)
- Necesitan actualizarse sin reescribir el documento completo

```json
{
  "_id": ObjectId("..."),
  "user_id": ObjectId("..."),
  "movie_id": ObjectId("..."),
  "score": 8.5,
  "review": "Amazing cinematography.",
  "created_at": ISODate("2024-06-15")
}
```

Índice compuesto `{ user_id: 1, movie_id: 1 }` con `unique: true` para evitar ratings duplicados.

---

## Resumen de colecciones

| Colección  | Documentos aprox. | Estrategia clave |
|------------|-------------------|------------------|
| `movies`   | Muchos            | Géneros embebidos, cast referenciado con rol |
| `genres`   | Pocos (catálogo)  | Fuente de verdad para formularios |
| `actors`   | Cientos           | Colección propia, referencia desde movies |
| `users`    | Muchos            | Historial embebido (últimos 50) |
| `ratings`  | Muy muchos        | Colección separada, índice único |

**Total: 5 colecciones** (vs 8 tablas en el modelo relacional).

---

## ¿Qué consultas se vuelven más fáciles?

- **Página de película:** un solo `findOne` trae título, géneros, descripción, cast con roles. No hay JOINs.
- **"Continuar viendo":** el historial ya está en el documento del usuario.
- **Películas por género:** `find({ "genres.name": "Thriller" })` — sin tabla intermedia.
- **Rating promedio en tiempo real:** campo precalculado, lectura O(1).

## ¿Qué se vuelve más difícil?

- **Filmografía de un actor:** requiere `find({ "cast.actor_id": id })` en vez de un JOIN simple.
- **Renombrar un género:** hay que actualizar la colección `genres` *y* hacer `updateMany` en `movies`.
- **Estadísticas globales** (top usuarios por ratings, distribución de scores): requieren aggregation pipelines donde SQL tendría GROUP BY triviales.
- **Garantizar consistencia referencial:** MongoDB no tiene foreign keys — borrar un actor no limpia las referencias en `movies`.
