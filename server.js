require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Genre, Actor, Movie, User, Rating } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/moviestream';

app.use(express.json());
app.use(express.static('public'));

// ─── DB CONNECTION ────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ─── MOVIES API ───────────────────────────────────────────────────────────────
app.get('/api/movies', async (req, res) => {
  try {
    const { search, genre, sort = '-created_at', page = 1, limit = 20 } = req.query;
    const query = {};
    if (search) query.title = { $regex: search, $options: 'i' };
    if (genre) query['genres.name'] = genre;

    const movies = await Movie.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Movie.countDocuments(query);
    res.json({ movies, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/movies/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });

    // Populate actor details manually
    const actorIds = movie.cast.map(c => c.actor_id);
    const actors = await Actor.find({ _id: { $in: actorIds } });
    const actorMap = Object.fromEntries(actors.map(a => [a._id.toString(), a]));

    const enrichedCast = movie.cast.map(c => ({
      ...c.toObject(),
      actor: actorMap[c.actor_id.toString()] || null
    }));

    const ratings = await Rating.find({ movie_id: movie._id })
      .sort('-created_at')
      .limit(10);

    res.json({ ...movie.toObject(), enrichedCast, ratings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/movies', async (req, res) => {
  try {
    const { title, year, description, duration_min, poster_url, genre_ids, cast } = req.body;

    // Build embedded genres from ids
    let embeddedGenres = [];
    if (genre_ids && genre_ids.length > 0) {
      const genresDocs = await Genre.find({ _id: { $in: genre_ids } });
      embeddedGenres = genresDocs.map(g => ({ _id: g._id, name: g.name }));
    }

    const movie = await Movie.create({
      title, year, description, duration_min, poster_url,
      genres: embeddedGenres,
      cast: cast || []
    });
    res.status(201).json(movie);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/movies/:id', async (req, res) => {
  try {
    const { title, year, description, duration_min, poster_url, genre_ids, cast } = req.body;

    let embeddedGenres = [];
    if (genre_ids && genre_ids.length > 0) {
      const genresDocs = await Genre.find({ _id: { $in: genre_ids } });
      embeddedGenres = genresDocs.map(g => ({ _id: g._id, name: g.name }));
    }

    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      { title, year, description, duration_min, poster_url, genres: embeddedGenres, cast },
      { new: true, runValidators: true }
    );
    if (!movie) return res.status(404).json({ error: 'Not found' });
    res.json(movie);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/movies/:id', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) return res.status(404).json({ error: 'Not found' });
    // Also delete associated ratings
    await Rating.deleteMany({ movie_id: req.params.id });
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GENRES API ───────────────────────────────────────────────────────────────
app.get('/api/genres', async (req, res) => {
  try {
    const genres = await Genre.find().sort('name');
    res.json(genres);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/genres', async (req, res) => {
  try {
    const { name } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const genre = await Genre.create({ name, slug });
    res.status(201).json(genre);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/genres/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const genre = await Genre.findByIdAndUpdate(req.params.id, { name, slug }, { new: true });
    if (!genre) return res.status(404).json({ error: 'Not found' });

    // Cascade update embedded genre name in movies
    await Movie.updateMany(
      { 'genres._id': genre._id },
      { $set: { 'genres.$.name': name } }
    );

    res.json(genre);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/genres/:id', async (req, res) => {
  try {
    const genre = await Genre.findById(req.params.id);
    if (!genre) return res.status(404).json({ error: 'Not found' });

    const usedInMovies = await Movie.countDocuments({ 'genres._id': genre._id });
    if (usedInMovies > 0) {
      return res.status(409).json({
        error: `Cannot delete: genre is used in ${usedInMovies} movie(s). Remove it from those movies first.`
      });
    }

    await Genre.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ACTORS API ───────────────────────────────────────────────────────────────
app.get('/api/actors', async (req, res) => {
  try {
    const actors = await Actor.find().sort('name');
    res.json(actors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── USERS API ────────────────────────────────────────────────────────────────
app.get('/api/users', async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};
    if (search) query.username = { $regex: search, $options: 'i' };
    const users = await User.find(query).sort('-created_at');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const ratings = await Rating.find({ user_id: user._id }).sort('-created_at').limit(10);
    // Populate movie titles for ratings
    const movieIds = ratings.map(r => r.movie_id);
    const ratingMovies = await Movie.find({ _id: { $in: movieIds } }, 'title');
    const movieMap = Object.fromEntries(ratingMovies.map(m => [m._id.toString(), m.title]));
    const enrichedRatings = ratings.map(r => ({ ...r.toObject(), movie_title: movieMap[r.movie_id.toString()] }));
    res.json({ ...user.toObject(), ratings: enrichedRatings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { username, email } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { username, email }, { new: true });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    await Rating.deleteMany({ user_id: req.params.id });
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RATINGS API ─────────────────────────────────────────────────────────────
app.get('/api/ratings', async (req, res) => {
  try {
    const { movie_id, user_id } = req.query;
    const query = {};
    if (movie_id) query.movie_id = movie_id;
    if (user_id) query.user_id = user_id;
    const ratings = await Rating.find(query).sort('-created_at').limit(50);
    res.json(ratings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ratings', async (req, res) => {
  try {
    const rating = await Rating.create(req.body);

    // Update denormalized avg_rating on movie
    const allRatings = await Rating.find({ movie_id: req.body.movie_id });
    const avg = allRatings.reduce((s, r) => s + r.score, 0) / allRatings.length;
    await Movie.findByIdAndUpdate(req.body.movie_id, {
      avg_rating: Math.round(avg * 10) / 10,
      rating_count: allRatings.length
    });

    res.status(201).json(rating);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── STATS ────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [movieCount, userCount, ratingCount, genreCount] = await Promise.all([
      Movie.countDocuments(),
      User.countDocuments(),
      Rating.countDocuments(),
      Genre.countDocuments()
    ]);

    const topRated = await Movie.find({ rating_count: { $gt: 0 } })
      .sort('-avg_rating')
      .limit(5)
      .select('title avg_rating rating_count year');

    res.json({ movieCount, userCount, ratingCount, genreCount, topRated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`MovieStream running on http://localhost:${PORT}`));
