const yapi = require('../yapi.js');
const mongoose = require('mongoose');
const autoIncrement = require('../utils/mongoose-auto-increment');

// Mongoose 5 sent explicitly undefined update values as BSON null. Mongoose 6+
// silently drops them. Preserve clearing a field without mutating the caller's
// update; leave BSON values, documents, dates and other typed objects alone.
function preserveUndefinedValues(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(preserveUndefinedValues);
  if (value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, preserveUndefinedValues(item)])
    );
  }
  return value;
}

/**
 * 所有的model都需要继承baseModel, 且需要 getSchema和getName方法，不然会报错
 */

class baseModel {
  constructor() {
    this.schema = new mongoose.Schema(this.getSchema(), { strictQuery: false });
    this.name = this.getName();

    if (this.isNeedAutoIncrement() === true) {
      this.schema.plugin(autoIncrement.plugin, {
        model: this.name,
        field: this.getPrimaryKey(),
        startAt: 11,
        incrementBy: yapi.commons.rand(1, 10)
      });
    }

    this.model = yapi.db(this.name, this.schema);
  }

  /**
   * Keep the application's Mongoose 5 write-result contract while using the
   * supported driver APIs. Return the query, rather than an eager promise, so
   * callers can still chain options or exec() and unused queries stay lazy.
   */
  updateDocuments(filter, update, options = {}) {
    const queryOptions = Object.assign({}, options);
    const method = queryOptions.multi ? 'updateMany' : 'updateOne';
    delete queryOptions.multi;
    return this.model[method](filter, preserveUndefinedValues(update), queryOptions).transform(result => {
      const legacy = {
        n: (result.matchedCount || 0) + (result.upsertedCount || 0),
        nModified: result.modifiedCount || 0,
        ok: result.acknowledged ? 1 : 0
      };
      if (result.upsertedCount) {
        legacy.upserted = [{ index: 0, _id: result.upsertedId }];
      }
      return legacy;
    });
  }

  removeDocuments(filter, options = {}) {
    // Model.remove() removed every matching document, even for non-ID filters.
    return this.model.deleteMany(filter, options).transform(result => ({
      n: result.deletedCount || 0,
      ok: result.acknowledged ? 1 : 0,
      deletedCount: result.deletedCount || 0
    }));
  }

  isNeedAutoIncrement() {
    return true;
  }

  /**
   * 可通过覆盖此方法生成其他自增字段
   */
  getPrimaryKey() {
    return '_id';
  }

  /**
   * 获取collection的schema结构
   */
  getSchema() {
    yapi.commons.log('Model Class need getSchema function', 'error');
  }

  getName() {
    yapi.commons.log('Model Class need name', 'error');
  }
}

module.exports = baseModel;
