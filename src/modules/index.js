// Mounts every module's routes. Module routers declare their full paths
// (e.g. /staff/dashboard), so they are mounted at the root.
module.exports = function registerModules(app) {
  app.use('/auth', require('./auth').routes); // use the prefix app.js used before
  app.use(require('./requests').routes);
  app.use(require('./workflow').routes);
  app.use(require('./reporting').routes);
  app.use(require('./users').routes);
  app.use(require('./pages').routes); // use the mount app.js used before
};
