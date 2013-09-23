var child_process = require('child_process');
var _ = require('underscore');
var express = require('express');
var fs = require('fs');
var path = require('path');
var temp = require('temp');
var async=  require('async');
var git = require('./git');
var gerrit = require('./gerrit');
var gitParser = require('./git-parser');
var winston = require('winston');
var socketIO;

exports.pathPrefix = '';

exports.registerApi = function(app, server, ensureAuthenticated, config) {

	if (config.dev)
		temp.track();

	ensureAuthenticated = ensureAuthenticated || function(req, res, next) { next(); };

	app.use(express.bodyParser());

	var sockets = {};
	var socketIdCounter = 0;
	var io;

	if (server) {
		// To speed up loading times, we start this the next tick since it doesn't have to be instantly started with the server
		process.nextTick(function() {
			if (!socketIO) socketIO = require('socket.io');
			io = socketIO.listen(server, {
				logger: {
					debug: winston.debug.bind(winston),
					info: winston.info.bind(winston),
					error: winston.error.bind(winston),
					warn: winston.warn.bind(winston)
				}
			});
			io.sockets.on('connection', function (socket) {
				var socketId = socketIdCounter++;
				sockets[socketId] = socket;
				socket.emit('connected', { socketId: socketId });
				socket.on('disconnect', function () {
					if (socket.watcher) {
						socket.watcher.close();
						socket.watcher = null;
						winston.info('Stop watching ' + socket.watcherPath);
					}
					delete sockets[socketId];
				});
				socket.on('watch', function (data, callback) {
					if (socket.watcher) {
						socket.leave(socket.watcherPath);
						socket.watcher.close(); // only one watcher per socket
						winston.info('Stop watching ' + socket.watcherPath);
					}
					socket.join(path.normalize(data.path)); // join room for this path
					socket.watcherPath = data.path;
					socket.watcher = fs.watch(data.path, function(event, filename) {
						// The .git dir changes on for instance 'git status', so we
						// can't trigger a change here (since that would lead to an endless
						// loop of the client getting the change and then requesting the new data)
						if (!filename || (filename != '.git' && filename.indexOf('.git/') != 0))
							socket.emit('working-tree-changed', { repository: data.path });
					});
					winston.info('Start watching ' + socket.watcherPath);
					callback();
				});
			});
		});
	}

	var ensurePathExists = function(req, res, next) {
		var path = req.param('path');
		if (!fs.existsSync(path)) {
			res.json(400, { error: 'No such path: ' + path, errorCode: 'no-such-path' });
		} else {
			next();
		}
	}

	var emitWorkingTreeChanged = function(repoPath) {
		if (io) {
			io.sockets.in(path.normalize(repoPath)).emit('working-tree-changed', { repository: repoPath });
			winston.info('emitting working-tree-changed to sockets, manually triggered');
		}
	}
	var emitGitDirectoryChanged = function(repoPath) {
		if (io) {
			io.sockets.in(path.normalize(repoPath)).emit('git-directory-changed', { repository: repoPath });
			winston.info('emitting git-directory-changed to sockets, manually triggered');
		}
	}

	var jsonFail = function(res, err) {
		res.json(400, err);
	}

	var jsonResultOrFail = function(res, err, result) {
		if (err) res.json(400, err);
		else res.json(result || {});
	}


	function credentialsOption(socketId) {
		var credentialsHelperPath = path.resolve(__dirname, '..', 'bin', 'credentials-helper').replace(/\\/g, '/');
		return '-c credential.helper="' + credentialsHelperPath + ' ' + socketId + '" ';
	}


	app.get(exports.pathPrefix + '/status', ensureAuthenticated, ensurePathExists, function(req, res) {
		git.status(req.param('path'))
			.always(jsonResultOrFail.bind(null, res));
	});

	app.post(exports.pathPrefix + '/init', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('init' + (req.body.bare ? ' --bare --shared' : ''), req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/clone', ensureAuthenticated, ensurePathExists, function(req, res) {
		var url = req.body.url.trim();
		if (url.indexOf('git clone ') == 0) url = url.slice('git clone '.length);
		git(credentialsOption(req.body.socketId) + ' clone "' + url + '" ' + '"' + req.param('destinationDir').trim() + '"', req.param('path'))
			.fail(jsonFail.bind(null, res))
			.done(function(result) { res.json({ path: path.resolve(req.param('path'), req.param('destinationDir')) }); })
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/fetch', ensureAuthenticated, ensurePathExists, function(req, res) {
		git(credentialsOption(req.body.socketId) + ' fetch ' + (req.body.ref ? 'origin ' + req.body.ref : ''), req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/push', ensureAuthenticated, ensurePathExists, function(req, res) {
		git(credentialsOption(req.body.socketId) + ' push origin ' + (req.body.localBranch ? req.body.localBranch : 'HEAD') +
			(req.body.remoteBranch ? ':' + req.body.remoteBranch : ''), req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/reset', ensureAuthenticated, ensurePathExists, function(req, res) {
		git.stashAndPop(req.param('path'), git('reset --hard "' + req.body.to + '"', req.param('path'), false))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.get(exports.pathPrefix + '/diff', ensureAuthenticated, ensurePathExists, function(req, res) {
		git.diffFile(req.param('path'), req.param('file'))
			.always(jsonResultOrFail.bind(null, res));
	});

	app.post(exports.pathPrefix + '/discardchanges', ensureAuthenticated, ensurePathExists, function(req, res){
		var task;
		if (req.param('all')) task = git.discardAllChanges(req.param('path'));
		else task = git.discardChangesInFile(req.param('path'), req.param('file').trim());

		task
			.always(jsonResultOrFail.bind(null, res))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/commit', ensureAuthenticated, ensurePathExists, function(req, res){
		git.commit(req.param('path'), req.param('amend'), req.param('message'), req.param('files'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.get(exports.pathPrefix + '/log', ensureAuthenticated, ensurePathExists, function(req, res){
		var limit = '';
		if (req.query.limit) limit = '--max-count=' + req.query.limit;
		git('log --decorate=full --pretty=fuller --all --parents ' + limit, req.param('path'))
			.parser(gitParser.parseGitLog)
			.always(function(err, log) {
				if (err) {
					if (err.stderr.indexOf('fatal: bad default revision \'HEAD\'') == 0)
						res.json([]);
					else if (err.stderr.indexOf('fatal: Not a git repository') == 0)
						res.json([]);
					else
						res.json(400, err);
				} else {
					res.json(log);
				}
			});
	});

	app.get(exports.pathPrefix + '/branches', ensureAuthenticated, ensurePathExists, function(req, res){
		git('branch', req.param('path'))
			.parser(gitParser.parseGitBranches)
			.always(jsonResultOrFail.bind(null, res));
	});

	app.post(exports.pathPrefix + '/branches', ensureAuthenticated, ensurePathExists, function(req, res){
		git('branch ' + (req.body.force ? '-f' : '') + ' "' + req.body.name.trim() +
			'" "' + (req.body.startPoint || 'HEAD').trim() + '"', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});

	app.del(exports.pathPrefix + '/branches', ensureAuthenticated, ensurePathExists, function(req, res){
		git('branch -D "' + req.param('name').trim() + '"', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});

	app.del(exports.pathPrefix + '/remote/branches', ensureAuthenticated, ensurePathExists, function(req, res){
		git(credentialsOption(req.param('socketId')) + ' push origin :"' + req.param('name').trim() + '"', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});

	app.get(exports.pathPrefix + '/tags', ensureAuthenticated, ensurePathExists, function(req, res){
		git('tag -l', req.param('path'))
			.parser(gitParser.parseGitTags)
			.always(jsonResultOrFail.bind(null, res));
	});

	app.get(exports.pathPrefix + '/remote/tags', ensureAuthenticated, ensurePathExists, function(req, res){
		git(credentialsOption(req.param('socketId')) + ' ls-remote --tags ', req.param('path'))
			.parser(gitParser.parseGitLsRemote)
			.always(jsonResultOrFail.bind(null, res));
	});

	app.post(exports.pathPrefix + '/tags', ensureAuthenticated, ensurePathExists, function(req, res){
		git('tag ' + (req.body.force ? '-f' : '') + ' -a "' + req.body.name.trim() + '" -m "' +
			req.body.name.trim() + '" "' + (req.body.startPoint || 'HEAD').trim() + '"', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});

	app.del(exports.pathPrefix + '/tags', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('tag -d "' + req.param('name').trim() + '"', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});
	
	app.del(exports.pathPrefix + '/remote/tags', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('push origin :"refs/tags/' + req.param('name').trim() + '"', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/checkout', ensureAuthenticated, ensurePathExists, function(req, res){
		git.stashAndPop(req.param('path'), git('checkout "' + req.body.name.trim() + '"', req.param('path'), false))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/cherrypick', ensureAuthenticated, ensurePathExists, function(req, res){
		git.stashAndPop(req.param('path'), git('cherry-pick "' + req.body.name.trim() + '"', req.param('path'), false))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.get(exports.pathPrefix + '/checkout', ensureAuthenticated, ensurePathExists, function(req, res){
		var HEADFile = path.join(req.param('path'), '.git', 'HEAD');
		if (!fs.existsSync(HEADFile)) 
			return res.json(400, { errorCode: 'not-a-repository', error: 'No such file: ' + HEADFile });
		fs.readFile(HEADFile, { encoding: 'utf8' }, function(err, text) {
			if (err) res.json(400, err);
			text = text.toString();
			var rows = text.split('\n');
			var branch = rows[0].slice('ref: refs/heads/'.length);
			res.json(branch);
		});
	});

	app.get(exports.pathPrefix + '/remotes', ensureAuthenticated, ensurePathExists, function(req, res){
		git('remote', req.param('path'))
			.parser(gitParser.parseGitRemotes)
			.always(jsonResultOrFail.bind(null, res));
	});

	app.get(exports.pathPrefix + '/remotes/:name', ensureAuthenticated, ensurePathExists, function(req, res){
		git.remoteShow(req.param('path'), req.params.name)
			.always(jsonResultOrFail.bind(null, res));
	});

	app.post(exports.pathPrefix + '/merge', ensureAuthenticated, ensurePathExists, function(req, res) {
		var noFF = '';
		if (config.noFFMerge) noFF = '--no-ff';
		git('merge ' + noFF +' "' + req.body.with.trim() + '"', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/merge/continue', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('commit --file=- ', req.param('path'))
			.started(function(process) {
				process.stdin.end(req.param('message'));
			})
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/merge/abort', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('merge --abort', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});


	app.post(exports.pathPrefix + '/rebase', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('rebase "' + req.body.onto.trim() + '"', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/rebase/continue', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('rebase --continue', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/rebase/abort', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('rebase --abort', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/resolveconflicts', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('add ' + req.body.files.map(function(file) { return '"' + file + '"'; }).join(' '), req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.post(exports.pathPrefix + '/submodules', ensureAuthenticated, ensurePathExists, function(req, res) {
		git('submodule add "' + req.body.submoduleUrl.trim() + '" "' + req.body.submodulePath.trim() + '"', req.param('path'))
			.always(jsonResultOrFail.bind(null, res))
			.always(emitGitDirectoryChanged.bind(null, req.param('path')))
			.always(emitWorkingTreeChanged.bind(null, req.param('path')));
	});

	app.get(exports.pathPrefix + '/quickstatus', ensureAuthenticated, function(req, res){
		fs.exists(req.param('path'), function(exists) {
			if (!exists) {
				res.json('no-such-path');
				return;
			}

			git('rev-parse --is-inside-work-tree', req.param('path'))
				.always(function(err, result) {
					if (err || result.indexOf('true') == -1) res.json('uninited');
					else res.json('inited');
				});
		})
	});

	app.get(exports.pathPrefix + '/gitconfig', ensureAuthenticated, function(req, res){
		git('config --list')
			.parser(gitParser.parseGitConfig)
			.always(jsonResultOrFail.bind(null, res));
	});

	// This method isn't called by the client but by credentials-helper.js
	app.get(exports.pathPrefix + '/credentials', ensureAuthenticated, function(req, res) {
		var socket = sockets[req.query.socketId];
		socket.once('credentials', function(data) {
			res.json(data);
		});
		socket.emit('request-credentials');
	});


	if (config.gerrit) {

		app.get(exports.pathPrefix + '/gerrit/commithook', ensureAuthenticated, ensurePathExists, function(req, res) {
			var repoPath = req.param('path');
			var hookPath = path.join(repoPath, '.git', 'hooks', 'commit-msg');
			if (fs.existsSync(hookPath)) res.json({ exists: true });
			else res.json({ exists: false });
		});

		app.post(exports.pathPrefix + '/gerrit/commithook', ensureAuthenticated, ensurePathExists, function(req, res) {
			var repoPath = req.param('path');
			git.remoteShow(repoPath, 'origin')
				.fail(jsonFail.bind(null, res))
				.done(function(remote) {
					if (!remote.fetch.host) throw new Error("Failed to parse host from: " + remote.fetch.address);
					var command = 'scp -p ';
					if (remote.fetch.port) command += ' -P ' + remote.fetch.port + ' ';
					command += remote.fetch.host + ':hooks/commit-msg .git/hooks/';
					var hooksPath = path.join(repoPath, '.git', 'hooks');
					if (!fs.existsSync(hooksPath)) fs.mkdirSync(hooksPath);
					child_process.exec(command, { cwd: repoPath },
						function (err, stdout, stderr) {
							if (err) return res.json(400, { error: err, stdout: stdout, stderr: stderr });
							res.json({});
						});
				});
		});

		app.get(exports.pathPrefix + '/gerrit/changes', ensureAuthenticated, ensurePathExists, function(req, res) {
			var repoPath = req.param('path');
			git.remoteShow(repoPath, 'origin')
				.fail(jsonFail.bind(null, res))
				.done(function(remote) {
					if (!remote.fetch.host) throw new Error("Failed to parse host from: " + remote.fetch.address);
					var command = 'query --format=JSON --current-patch-set status:open project:' + remote.fetch.project + '';
					gerrit(remote.fetch, command, res, function(err, result) {
						if (err) return;
						result = result.split('\n').filter(function(r) { return r.trim(); });
						result = result.map(function(r) { return JSON.parse(r); });
						res.json(result);
					});
				});
		});

	}

	if (config.dev) {

		app.post(exports.pathPrefix + '/testing/createtempdir', ensureAuthenticated, function(req, res){
			temp.mkdir('test-temp-dir', function(err, path) {
				res.json({ path: path });
			});
		});
		app.post(exports.pathPrefix + '/testing/createdir', ensureAuthenticated, function(req, res){
			fs.mkdir(req.param('dir'), function() {
				res.json({});
			});
		});
		app.post(exports.pathPrefix + '/testing/createfile', ensureAuthenticated, function(req, res){
			var content = req.body.content;
			if (req.body.content === undefined) content = ('test content\n' + Math.random() + '\n');
			fs.writeFileSync(req.param('file'), content);
			res.json({ });
		});
		app.post(exports.pathPrefix + '/testing/changefile', ensureAuthenticated, function(req, res){
			var content = req.param('content');
			if (content === undefined) content = ('test content\n' + Math.random() + '\n');
			fs.writeFileSync(req.param('file'), content);
			res.json({ });
		});
		app.post(exports.pathPrefix + '/testing/removefile', ensureAuthenticated, function(req, res){
			fs.unlinkSync(req.param('file'));
			res.json({ });
		});
		app.post(exports.pathPrefix + '/testing/git', ensureAuthenticated, function(req, res){
			git(req.param('command'), req.param('repo'))
				.always(jsonResultOrFail.bind(null, res));
		});
		app.post(exports.pathPrefix + '/testing/cleanup', ensureAuthenticated, function(req, res){
			var cleaned = temp.cleanup();
			//winston.info('Cleaned up: ' + JSON.stringify(cleaned));
			res.json({ result: cleaned });
		});
		app.post(exports.pathPrefix + '/testing/shutdown', ensureAuthenticated, function(req, res){
			res.json({ });
			process.exit();
		});
	}

};
