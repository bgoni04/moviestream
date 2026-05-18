const mongoose = require('mongoose');

// Genre Schema
const genreSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  created_at: { type: Date, default: Date.now }
});

// Actor Schema
const actorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  birth_date: Date,
  nationality: String,
  bio: String,
  photo_url: String,
  created_at: { type: Date, default: Date.now }
});

// Movie Schema
const movieSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  description: String,
  duration_min: Number,
  poster_url: String,
  genres: [{
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Genre' },
    name: String
  }],
  cast: [{
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Actor' },
    role: String
  }],
  avg_rating: { type: Number, default: 0 },
  rating_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  created_at: { type: Date, default: Date.now },
  watch_history: [{
    movie_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' },
    movie_title: String,
    watched_at: { type: Date, default: Date.now },
    progress_pct: { type: Number, default: 0 }
  }]
});

// Rating Schema
const ratingSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  movie_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
  score: { type: Number, required: true, min: 1, max: 10 },
  review: String,
  created_at: { type: Date, default: Date.now }
});

ratingSchema.index({ user_id: 1, movie_id: 1 }, { unique: true });

const Genre = mongoose.model('Genre', genreSchema);
const Actor = mongoose.model('Actor', actorSchema);
const Movie = mongoose.model('Movie', movieSchema);
const User = mongoose.model('User', userSchema);
const Rating = mongoose.model('Rating', ratingSchema);

module.exports = { Genre, Actor, Movie, User, Rating };
