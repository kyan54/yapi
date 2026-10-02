const mongoose = require('mongoose');
const yapi = require('../yapi.js');
const autoIncrement = require('./mongoose-auto-increment');

function model(name, schema) {
  if (!(schema instanceof mongoose.Schema)) schema = new mongoose.Schema(schema);
  schema.set('autoIndex', false);
  schema.set('autoCreate', false);
  // Preserve Mongoose 5 filtering. Stripping unknown filters can widen writes.
  schema.set('strictQuery', false);
  return mongoose.model(name, schema, name);
}

function connectionOptions(dbConfig) {
  const options = { ...dbConfig.options };
  if (dbConfig.user && options.user === undefined) options.user = dbConfig.user;
  if (dbConfig.pass && options.pass === undefined) options.pass = dbConfig.pass;
  const obsolete = ['useNewUrlParser', 'useUnifiedTopology', 'useFindAndModify',
    'useCreateIndex', 'reconnectTries', 'reconnectInterval', 'keepAlive', 'keepAliveInitialDelay'];
  for (const key of obsolete) delete options[key];
  if (options.poolSize !== undefined) {
    if (options.maxPoolSize === undefined) options.maxPoolSize = options.poolSize;
    delete options.poolSize;
  }
  return options;
}

function connect(callback) {
  mongoose.set('strictQuery', false);
  const config = yapi.WEBCONFIG.db;
  const options = connectionOptions(config);
  let connectString = config.connectString;
  if (!connectString) {
    connectString = `mongodb://${config.servername}:${config.port}/${config.DATABASE}`;
    if (config.authSource) connectString += `?authSource=${encodeURIComponent(config.authSource)}`;
  }
  // Register synchronously: model construction may precede the connection promise.
  autoIncrement.initialize(mongoose.connection);
  const connection = mongoose.connect(connectString, options);
  connection.then(() => {
    yapi.commons.log('mongodb load success...');
    if (typeof callback === 'function') callback.call(connection);
  }).catch(error => {
    // Driver messages may contain a URI or credentials; do not log their text.
    yapi.commons.log('mongodb connect error (' + error.name + ')', 'error');
  });
  // Preserve a rejecting promise for callers that await startup readiness.
  return connection;
}

yapi.db = model;
module.exports = { model, connect, connectionOptions };
