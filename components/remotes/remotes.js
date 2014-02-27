
var ko = require('knockout');
var _ = require('lodash');
var async = require('async');
var components = require('ungit-components');
var programEvents = require('ungit-program-events');

components.register('remotes', function(args) {
  return new RemotesViewModel(args.repositoryViewModel);
});

function RemotesViewModel(repository) {
  var self = this;
  this.repository = repository;
  this.repoPath = repository.repoPath;
  this.server = this.repository.server;
  this.remotes = ko.observable([]);
  this.currentRemote = ko.observable(null);
  this.fetchLabel = ko.computed(function() {
    if (self.currentRemote()) return 'Fetch nodes from ' + self.currentRemote();
    else return 'No remotes specified';
  })

  this.fetchingProgressBar = components.create('progressBar', { predictionMemoryKey: 'fetching-' + this.repoPath, temporary: true });

  this.fetchEnabled = ko.computed(function() {
    return self.remotes().length > 0;
  });

  this.shouldAutoFetch = ungit.config.autoFetch;
}
RemotesViewModel.prototype.updateNode = function(parentElement) {
  ko.renderTemplate('remotes', this, {}, parentElement);
}
RemotesViewModel.prototype.clickFetch = function() { this.fetch({ nodes: true, tags: true }); }
RemotesViewModel.prototype.onProgramEvent = function(event) {
  if (event.event == 'request-credentials') self.fetchingProgressBar.pause();
  else if (event.event == 'request-credentials-response') self.fetchingProgressBar.unpause();
}
RemotesViewModel.prototype.fetch = function(options, callback) {
  if (this.fetchingProgressBar.running()) return;
  var self = this;

  this.fetchingProgressBar.start();
  var jobs = [];
  if (options.tags) jobs.push(function(done) { self.server.get('/remote/tags', { path: self.repoPath, remote: self.currentRemote() }, done); });
  if (options.nodes) jobs.push(function(done) { self.server.post('/fetch', { path: self.repoPath, remote: self.currentRemote() }, done);  });
  async.parallel(jobs, function(err, result) {
    self.fetchingProgressBar.stop();

    if (!err && options.tags) self.repository.graph.setRemoteTags(result[0]);
  });
}

RemotesViewModel.prototype.updateRemotes = function() {
  var self = this;
  this.server.get('/remotes', { path: this.repoPath }, function(err, remotes) {
    if (err && err.errorCode == 'not-a-repository') return true;
    if (err) return;
    remotes = remotes.map(function(remote) {
      return {
        name: remote,
        changeRemote: function() { self.currentRemote(remote) }
      }
    });
    self.remotes(remotes);
    if (!self.currentRemote() && remotes.length > 0) {
      if (_.find(remotes, { 'name': 'origin' })) // default to origin if it exists
        self.currentRemote('origin');
      else // otherwise take the first one
        self.currentRemote(remotes[0].name);
      if (self.shouldAutoFetch) {
        self.fetch({ nodes: true, tags: true });
      }
    }
    self.shouldAutoFetch = false;
  });
}
RemotesViewModel.prototype.showAddRemoteDialog = function() {
  var self = this;
  var diag = components.create('addremotedialog');
  diag.closed.add(function() {
    if (diag.isSubmitted()) {
      self.server.post('/remotes/' + encodeURIComponent(diag.name()), { path: self.repoPath, url: diag.url() }, function(err, res) {
        if (err) return;
        self.updateRemotes();
      })
    }
  });
  programEvents.dispatch({ event: 'request-show-dialog', dialog: diag });
}

