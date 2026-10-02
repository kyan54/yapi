'use strict';

const mongoose = require('mongoose');
let IdentityCounter;
const indexPromises = new WeakMap();

// Keep the existing model, collection, compound key and count field unchanged.
exports.initialize = function(connection = mongoose.connection) {
  if (IdentityCounter && IdentityCounter.db === connection) return IdentityCounter;
  const schema = new mongoose.Schema({
    model: { type: String, required: true },
    field: { type: String, required: true },
    count: { type: Number, default: 0 }
  }, { autoIndex: false, autoCreate: false });
  schema.index({ field: 1, model: 1 }, { unique: true });
  IdentityCounter = connection.models.IdentityCounter || connection.model('IdentityCounter', schema);
  return IdentityCounter;
};

function safeInteger(value, name) {
  if (!Number.isSafeInteger(value)) throw new Error(name + ' must be a safe integer');
  return value;
}

// Both legacy callback callers and new promise callers are supported, without
// passing callbacks into Mongoose's removed callback APIs.
function callbackResult(promise, callback) {
  if (typeof callback === 'function') promise.then(value => callback(null, value), callback);
  return promise;
}

exports.plugin = function(schema, options) {
  if (!IdentityCounter) throw new Error('mongoose-auto-increment has not been initialized');
  const Counter = IdentityCounter;
  const settings = Object.assign({ model: null, field: '_id', startAt: 0,
    incrementBy: 1, unique: true }, typeof options === 'string' ? { model: options } : options);
  if (!settings.model || typeof settings.model !== 'string') throw new Error('model must be set');
  safeInteger(settings.startAt, 'startAt');
  safeInteger(settings.incrementBy, 'incrementBy');
  if (settings.incrementBy <= 0) throw new Error('incrementBy must be positive');
  const initial = safeInteger(settings.startAt - settings.incrementBy, 'initial count');
  const field = { type: Number };
  // _id already has MongoDB's mandatory unique index. Allocation occurs in save
  // middleware after validation, matching the original plugin's save behavior.
  if (settings.field !== '_id') field.unique = settings.unique;
  schema.add({ [settings.field]: field });
  const key = { model: settings.model, field: settings.field };
  let ready;

  function ensureCounter() {
    if (!ready) {
      ready = (async () => {
        // Without this unique index simultaneous upserts can create two counters.
        // Index creation errors (including duplicate legacy counters) fail closed.
        if (!indexPromises.has(Counter)) indexPromises.set(Counter,
          Counter.collection.createIndex({ field: 1, model: 1 }, { unique: true }));
        await indexPromises.get(Counter);
        try {
          await Counter.updateOne(key, { $setOnInsert: { count: initial } },
            { upsert: true, setDefaultsOnInsert: false });
        } catch (error) {
          if (error.code !== 11000) throw error;
          // Another process won the unique-key insert; use its existing counter.
        }
        const counter = await Counter.findOne(key).lean();
        if (!counter) throw new Error('Identity counter initialization failed');
        safeInteger(counter.count, 'stored count');
        // Recover safely if a legacy counter is missing/stale after an import.
        // Existing numeric IDs are never rewritten, and $max never lowers state.
        const DocumentModel = Counter.db.models[settings.model];
        if (DocumentModel) {
          const highest = await DocumentModel.findOne({ [settings.field]: { $type: 'number' } })
            .sort({ [settings.field]: -1 }).select({ [settings.field]: 1 }).lean();
          if (highest) {
            const maximum = safeInteger(highest[settings.field], 'existing maximum ID');
            await Counter.updateOne(key, { $max: { count: maximum } });
          }
        }
      })();
    }
    return ready;
  }

  function nextCount(callback) {
    return callbackResult((async () => {
      await ensureCounter();
      const counter = await Counter.findOne(key).lean();
      if (!counter) throw new Error('Identity counter missing');
      return safeInteger(counter.count + settings.incrementBy, 'next count');
    })(), callback);
  }
  function resetCount(callback) {
    return callbackResult((async () => {
      await ensureCounter();
      // Legacy administrative API. Must not be used against nonempty collections
      // or concurrently with writes; normal allocation never decreases a counter.
      await Counter.updateOne(key, { $set: { count: initial } });
      return settings.startAt;
    })(), callback);
  }
  schema.method('nextCount', nextCount);
  schema.static('nextCount', nextCount);
  schema.method('resetCount', resetCount);
  schema.static('resetCount', resetCount);

  schema.pre('save', async function() {
    if (!this.isNew) return;
    await ensureCounter();
    if (this[settings.field] !== undefined && this[settings.field] !== null) {
      const explicit = safeInteger(this[settings.field], 'explicit ID');
      // $max cannot lower a concurrent writer's counter or reuse its allocation.
      const result = await Counter.updateOne(key, { $max: { count: explicit } });
      if (result.matchedCount === 0 || result.n === 0) throw new Error('Identity counter missing');
      return;
    }
    const counter = await Counter.findOneAndUpdate({ ...key,
      count: { $lte: Number.MAX_SAFE_INTEGER - settings.incrementBy }
    }, { $inc: { count: settings.incrementBy } }, { new: true });
    if (!counter) throw new Error('Identity counter missing or exhausted');
    this[settings.field] = safeInteger(counter.count, 'allocated ID');
  });
};
