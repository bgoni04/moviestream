# MovieStream — MongoDB Document Model Explorer

A full-stack web app for exploring and managing the MovieStream domain using MongoDB as the database. Built as an academic project for an Advanced Databases course.

## What it does

- **CRUD on Movies** — create, read, update, delete movies with embedded genres and referenced cast
- **CRUD on Genres** — manage the genre catalog with cascade update to embedded movie documents
- **CRUD on Users** — manage users with embedded watch history
- Live stats bar (movie count, genre count, user count, ratings count)
- Filter movies by genre and search by title
- View ratings, cast, and watch history per document

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Server | Node.js + Express | Minimal, no overhead, easy Mongoose integration |
| Database | MongoDB (Atlas M0) | Assignment requirement |
| ODM | Mongoose | Schema validation + cleaner query syntax |
| Frontend | Vanilla HTML/CSS/JS | No framework needed for this scope — one file, zero build step |

## Running locally

**Prerequisites:** Node.js ≥ 18, a MongoDB instance (local or Atlas)

```bash
# 1. Clone and install
git clone <repo-url>
cd moviestream
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set MONGO_URI

# 3. Seed the database (20 movies, 5 genres, 10 actors, 15 users, ~60 ratings)
npm run seed

# 4. Start the server
npm start
# → http://localhost:3000
```

### .env.example
```
MONGO_URI=mongodb://localhost:27017/moviestream
PORT=3000
```

For MongoDB Atlas: `MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/moviestream`

## Seeding

```bash
npm run seed
```

This script:
1. Drops all existing data
2. Inserts 5 genres, 10 actors, 20 movies, 15 users, ~60 ratings
3. Recalculates `avg_rating` and `rating_count` on each movie

## Deployment

Deployed on Render (free tier). MongoDB on Atlas M0.

**Live URL:** `<your-render-url>`

## Repository structure

```
moviestream/
├── models/index.js      # Mongoose schemas (Genre, Actor, Movie, User, Rating)
├── scripts/seed.js      # Database seed script
├── public/index.html    # Single-page frontend (HTML + CSS + JS)
├── server.js            # Express API + static serving
├── MODEL.md             # Document model design decisions
├── REFLECTION.md        # Post-mortem reflection
└── package.json
```

## Screenshot

![MovieStream App](screenshot.png)

---

*Actividad de Bases de Datos Avanzadas — Ingeniería en Tecnologías Computacionales*
