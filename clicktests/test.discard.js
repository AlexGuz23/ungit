
var helpers = require('./helpers');
var testsuite = require('./testsuite');
var Environment = require('./environment');
var webpage = require('webpage');

var muteGraceTimeDuration = 60 * 1000 * 5;

var page = webpage.create();
// var suite = testsuite.newSuite('discardwarn', page, { timeout: muteGraceTimeDuration + 5000 });
var suite = testsuite.newSuite('discard', page);

var environment;
var testRepoPath;

var createAndDiscard = function(callback, dialogButtonToClick) {
  environment.createTestFile(testRepoPath + '/testfile2.txt', function(err) {
    if (err) return callback(err);
    helpers.waitForElement(page, '[data-ta-container="staging-file"]', function() {
      helpers.click(page, '[data-ta-clickable="discard-file"]');

      if (dialogButtonToClick) {
        helpers.click(page, '[data-ta-clickable="' + dialogButtonToClick + '"]');
      } else {
        helpers.expectNotFindElement(page, '[data-ta-clickable="yes"]');
      }

      if (dialogButtonToClick !== 'no') {
        helpers.waitForNotElement(page, '[data-ta-container="staging-file"]', function() {
          callback();
        });
      } else {
        helpers.waitForElement(page, '[data-ta-container="staging-file"]', function() {
          callback();
        });
      }
    });
  });
}


suite.test('Init', function(done) {
  environment = new Environment(page, { serverStartupOptions: ['--disableDiscardWarning'] });
  environment.init(function(err) {
    if (err) return done(err);
    testRepoPath = environment.path + '/testrepo';
    environment.createRepos([
      { bare: false, path: testRepoPath }
      ], done);
  });
});


suite.test('Open repo screen', function(done) {
  page.open(environment.url + '/#/repository?path=' + encodeURIComponent(testRepoPath), function () {
    helpers.waitForElement(page, '.graph', function() {
      setTimeout(done, 1000); // Let it finnish loading
    });
  });
});

suite.test('Should be possible to discard a created file without warning message', function(done) {
  createAndDiscard(done);
});


suite.test('Shutdown', function(done) {
  environment.shutdown(done);
});


// reinit with disableDiscardWarning is false, strangely port is not released and need investigation
suite.test('Init', function(done) {
  // environment = new Environment(page, { port: 8500, serverStartupOptions: ['--no-disableDiscardWarning'], serverTimeout: muteGraceTimeDuration + 5000 });
  environment = new Environment(page, { port: 8500, serverStartupOptions: ['--no-disableDiscardWarning'], serverTimeout: 15000 });
  environment.init(function(err) {
    if (err) return done(err);
    testRepoPath = environment.path + '/testrepo';
    environment.createRepos([
      { bare: false, path: testRepoPath }
      ], done);
  });
});

suite.test('Open repo screen', function(done) {
  page.open(environment.url + '/#/repository?path=' + encodeURIComponent(testRepoPath), function () {
    helpers.waitForElement(page, '.graph', function() {
      setTimeout(done, 1000); // Let it finnish loading
    });
  });
});

suite.test('Should be possible to select no from discard', function(done) {
  createAndDiscard(done, 'no');
});

suite.test('Should be possible to discard a created file', function(done) {
  createAndDiscard(done, 'yes');
});

suite.test('Should be possible to discard a created file and disable warn for awhile', function(done) {
  createAndDiscard(function(err) {
    if (err) done(err);
    createAndDiscard(function(err) {
      done(err);
      // we could do below and wait for 5 minutes and see warning message pop up again but let's not....
      // setTimeout(function() {
      //   createAndDiscard(done, 'yes');
      // }, muteGraceTimeDuration + 500);
    });
  }, 'mute');
});

suite.test('Shutdown', function(done) {
  environment.shutdown(done);
});

testsuite.runAllSuits();
