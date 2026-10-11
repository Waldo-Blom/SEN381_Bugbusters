const { register } = require('./notifications.listener');

let unregister;

exports.initialize = () => {
  if (!unregister) {
    unregister = register();
  }
  return unregister;
};
