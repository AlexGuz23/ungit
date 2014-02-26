
var navigation = {};
module.exports = navigation;

var hasher = navigation.hasher = require('hasher');
var crossroads = navigation.crossroads = require('crossroads');

navigation.browseTo = function(path) {
  hasher.setHash(path);
}

navigation.init = function() {

  //setup hasher
  function parseHash(newHash, oldHash){
    crossroads.parse(newHash);
  }
  hasher.initialized.add(parseHash); //parse initial hash
  hasher.changed.add(parseHash); //parse hash changes

  hasher.init();

}