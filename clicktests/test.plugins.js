
var helpers = require('./helpers');
var testsuite = require('./testsuite');
var Environment = require('./environment');
var webpage = require('webpage');

var page = webpage.create();
var suite = testsuite.newSuite('plugins', page);

var environment;

suite.test('Init', function(done) {
  environment = new Environment(page, {
    serverStartupOptions: ['--pluginDirectory=' + phantom.libraryPath + '/test-plugins']
  });
  environment.init(done);
});

suite.test('Plugin should replace all of the app', function(done) {
  page.open(environment.url, function() {
    helpers.waitForElementVisible(page, '[data-ta-element="dummy-app"]', function() {
      helpers.expectNotFindElement(page, '[data-ta-container="app"]');
      done();
    });
  });
});

suite.test('Shutdown', function(done) {
  environment.shutdown(done);
});

testsuite.runAllSuits();
