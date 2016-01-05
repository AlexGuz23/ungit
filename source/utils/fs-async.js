var Promise = require('bluebird');
var fs = Promise.promisifyAll(require("fs"));
var semver = require('semver');

fs.isFileExists = function(file) {
  if (semver.satisfies(process.version, '>0.10')) {
    return fs.accessAsync(file, fs.F_OK)
      .then(function() { return true; })
      .catch(function() { return false; });
  } else {
    return fs.existsAsync(file);
  }
}

module.exports = fs;
