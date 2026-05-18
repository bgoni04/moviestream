/**
 * seed.js — MovieStream MongoDB seed
 * Fuente de datos: OCI Object Storage (Oracle LiveLabs MovieStream)
 *
 * Carga datos reales:
 *   - 25 géneros  (data/genre.csv)
 *   - 3,800 películas (data/movies.json) con géneros embebidos
 *   - 15 customers reales como usuarios (data/customer.csv)
 *   - Watch history derivado de custsales (transacciones reales del mes dic 2020)
 *   - Ratings derivados del campo `views` de cada película
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Genre, Movie, User, Rating } = require('../models');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/moviestream';
const DATA = path.join(__dirname, '../data');

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function parseNum(v) {
  if (!v || v === 'null' || v === '') return null;
  const n = Number(String(v).replace(/\+/g, ''));
  return isNaN(n) ? null : n;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cleanStr(s) {
  return (s || '').replace(/^"|"$/g, '').trim();
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✔ Connected:', MONGO_URI.replace(/:\/\/.*@/, '://***@'));

  await Promise.all([
    Genre.deleteMany({}),
    Movie.deleteMany({}),
    User.deleteMany({}),
    Rating.deleteMany({})
  ]);
  console.log('✔ Collections cleared\n');

  // ── 1. GENRES ────────────────────────────────────────────────────────────────
  const genreRaw = parse(fs.readFileSync(path.join(DATA, 'genre.csv')), {
    columns: true, skip_empty_lines: true, trim: true
  });

  const genres = await Genre.insertMany(genreRaw.map(r => ({
    oracle_id: Number(r.GENRE_ID),
    name: cleanStr(r.NAME),
    slug: slugify(cleanStr(r.NAME))
  })));

  const genreByName = Object.fromEntries(genres.map(g => [g.name, g]));
  console.log(`✔ Genres: ${genres.length}`);

  // ── 2. MOVIES ─────────────────────────────────────────────────────────────────
  const moviesRaw = fs.readFileSync(path.join(DATA, 'movies.json'), 'utf8')
    .trim().split('\n').map(l => JSON.parse(l));

  const movieDocs = moviesRaw.map(m => ({
    oracle_movie_id: m.movie_id,
    title: m.title,
    year: parseNum(m.year),
    description: m.summary || null,
    duration_min: parseNum(m.runtime),
    poster_url: m.image_url || null,
    list_price: parseNum(m.list_price),
    sku: m.sku || null,
    studio: Array.isArray(m.studio) ? m.studio : (m.studio ? [m.studio] : []),
    nominations: m.nominations || [],
    views: parseNum(m.views) || 0,
    genres: (m.genre || [])
      .map(name => genreByName[name])
      .filter(Boolean)
      .map(g => ({ _id: g._id, name: g.name })),
    cast: (m.cast || []).slice(0, 10).map(name => ({ name, role: null })),
    avg_rating: 0,
    rating_count: 0,
    created_at: m.opening_date ? new Date(m.opening_date) : new Date()
  }));

  // Batch insert
  let movies = [];
  for (let i = 0; i < movieDocs.length; i += 500) {
    const batch = await Movie.insertMany(movieDocs.slice(i, i + 500), { ordered: false });
    movies = movies.concat(batch);
  }
  console.log(`✔ Movies: ${movies.length}`);

  const movieByOracleId = Object.fromEntries(movies.map(m => [m.oracle_movie_id, m]));

  // ── 3. USERS + WATCH HISTORY ─────────────────────────────────────────────────
  const customersRaw = parse(fs.readFileSync(path.join(DATA, 'customer.csv')), {
    columns: true, skip_empty_lines: true, trim: true
  });

  const salesRaw = parse(fs.readFileSync(path.join(DATA, 'custsales.csv')), {
    columns: true, skip_empty_lines: true, trim: true
  });

  // Index sales by CUST_ID
  const salesByCust = {};
  for (const row of salesRaw) {
    const id = cleanStr(row.CUST_ID);
    if (!salesByCust[id]) salesByCust[id] = [];
    salesByCust[id].push(row);
  }

  // Pick 15 customers that actually have transactions in custsales
  const custIdsWithSales = new Set(Object.keys(salesByCust));
  const customersWithSales = customersRaw.filter(c => custIdsWithSales.has(cleanStr(c.CUST_ID)));
  const step = Math.floor(customersWithSales.length / 15);
  const selectedCustomers = Array.from({ length: 15 }, (_, i) => customersWithSales[i * step]);

  const userDocs = selectedCustomers.map(c => {
    const custId = cleanStr(c.CUST_ID);
    const sales = (salesByCust[custId] || []).slice(0, 20);

    const watch_history = sales
      .map(s => {
        const movie = movieByOracleId[Number(s.MOVIE_ID)];
        if (!movie) return null;
        return {
          movie_id: movie._id,
          movie_title: movie.title,
          watched_at: new Date(s.DAY_ID),
          progress_pct: 100,
          app: s.APP,
          device: s.DEVICE
        };
      })
      .filter(Boolean);

    const first = cleanStr(c.FIRST_NAME);
    const last = cleanStr(c.LAST_NAME);
    return {
      oracle_cust_id: Number(custId),
      username: `${first.toLowerCase()}.${last.toLowerCase()}`.replace(/[^a-z.]/g, ''),
      email: cleanStr(c.EMAIL),
      full_name: `${first} ${last}`,
      country: cleanStr(c.COUNTRY),
      city: cleanStr(c.CITY),
      age: parseNum(c.AGE),
      gender: cleanStr(c.GENDER),
      income_level: cleanStr(c.INCOME_LEVEL),
      yrs_customer: parseNum(c.YRS_CUSTOMER),
      watch_history,
      created_at: new Date()
    };
  });

  const users = await User.insertMany(userDocs);
  const watchTotal = users.reduce((s, u) => s + u.watch_history.length, 0);
  console.log(`✔ Users: ${users.length} (${watchTotal} watch history entries from custsales)`);

  // ── 4. RATINGS ────────────────────────────────────────────────────────────────
  // Derived from `views` field: most-viewed movies get more ratings
  const ratingDocs = [];
  const topMovies = movies
    .filter(m => m.views > 50)
    .sort((a, b) => b.views - a.views)
    .slice(0, 100);

  for (const movie of topMovies) {
    const numRaters = Math.min(users.length, Math.max(1, Math.floor(movie.views / 800)));
    for (const user of users.slice(0, numRaters)) {
      const base = Math.min(10, 5 + Math.log10(movie.views + 1));
      const score = Math.max(1, Math.min(10,
        Math.round((base + (Math.random() * 3 - 1.5)) * 10) / 10
      ));
      ratingDocs.push({
        user_id: user._id,
        movie_id: movie._id,
        score,
        review: null,
        created_at: new Date(Date.now() - Math.random() * 180 * 24 * 3600 * 1000)
      });
    }
  }

  await Rating.insertMany(ratingDocs, { ordered: false });

  // Update avg_rating + rating_count
  const byMovie = {};
  for (const r of ratingDocs) {
    const k = r.movie_id.toString();
    if (!byMovie[k]) byMovie[k] = [];
    byMovie[k].push(r.score);
  }

  await Movie.bulkWrite(
    Object.entries(byMovie).map(([id, scores]) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(id) },
        update: {
          $set: {
            avg_rating: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
            rating_count: scores.length
          }
        }
      }
    }))
  );

  console.log(`✔ Ratings: ${ratingDocs.length} across ${Object.keys(byMovie).length} movies`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Seed complete — Oracle MovieStream data loaded');
  console.log(`   Géneros:  ${genres.length}`);
  console.log(`   Películas: ${movies.length}`);
  console.log(`   Usuarios: ${users.length}`);
  console.log(`   Ratings:  ${ratingDocs.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
