var expect = require('expect.js');
var restGit = require('../git-api');

var common = exports;

common.wrapErrorHandler = function(done, callback) {
	return function(err, res) {
		if (err) {
			console.dir(err);
			console.dir(res.body);
			done(err, res);
		} else if (callback) {
			callback(err, res);
		} else {
			done(err, res);
		}
	}
}

common.get = function(req, path, payload, done, callback) {
	var r = req
		.get(restGit.pathPrefix + path);
	if (payload !== undefined)
		r.query(payload);
	r
		.set('Accept', 'application/json')
		.expect('Content-Type', /json/)
		.expect(200)
		.end(common.wrapErrorHandler(done, callback || done));
}

common.post = function(req, path, payload, done, callback) {
	var r = req
		.post(restGit.pathPrefix + path);
	if (payload !== undefined)
		r.send(payload);
	r
		.set('Accept', 'application/json')
		.expect('Content-Type', /json/)
		.expect(200)
		.end(common.wrapErrorHandler(done, callback || done));
}

common.createSmallRepo = function(req, done, callback) {
	var testDir;
	common.post(req, '/testing/createdir', undefined, done, function(err, res) {
		expect(res.body.path).to.be.ok();
		testDir = res.body.path;
		common.post(req, '/init', { path: testDir }, done, function() {
			callback(testDir);
		});
	});
}