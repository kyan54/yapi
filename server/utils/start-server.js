'use strict';

// Keep dependency readiness separate from listen readiness so tests can force
// the otherwise intermittent connection ordering without retries or sleeps.
module.exports = async function startServer({app, connection, port, host, timeout}) {
  await connection;
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    server.once('error', reject);
    server.once('listening', () => {
      server.removeListener('error', reject);
      server.setTimeout(timeout);
      resolve(server);
    });
  });
};
