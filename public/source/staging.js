
var ko = require('../vendor/js/knockout-2.2.1');
var ProgressBarViewModel = require('./controls').ProgressBarViewModel;
var screens = require('./screens');
var dialogs = require('./dialogs');
var inherits = require('util').inherits;

var StagingViewModel = function(repository) {
	var self = this;
	this.repository = repository;
	this.app =repository.app;
	this.repoPath = this.repository.repoPath;
	this.filesByPath = {};
	this.files = ko.observable([]);
	this.commitMessageTitle = ko.observable();
	this.commitMessageBody = ko.observable();
	this.inRebase = ko.observable(false);
	this.inMerge = ko.observable(false);
	this.allStageFlag = false;
	this.commitButtonVisible = ko.computed(function() {
		return !self.inRebase() && !self.inMerge();
	});
	this.nFiles = ko.computed(function() {
		return self.files().length;
	});
	this.nStagedFiles = ko.computed(function() {
		return self.files().filter(function(f) { return f.staged(); }).length;
	});
	this.stats = ko.computed(function() {
		return self.nFiles() + ' files, ' + self.nStagedFiles() + ' to be commited';
	});
	this.amend = ko.observable(false);
	this.canAmend = ko.computed(function() {
		return self.repository.graph.HEAD() && !self.inRebase() && !self.inMerge();
	});
	this.showNux = ko.computed(function() {
		return self.files().length == 0 && !self.amend();
	});
	this.refreshingProgressBar = new ProgressBarViewModel('refreshing-' + repository.repoPath);
	this.committingProgressBar = new ProgressBarViewModel('committing-' + repository.repoPath);
	this.rebaseContinueProgressBar = new ProgressBarViewModel('rebase-continue-' + repository.repoPath);
	this.rebaseAbortProgressBar = new ProgressBarViewModel('rebase-abort-' + repository.repoPath);
	this.mergeContinueProgressBar = new ProgressBarViewModel('merge-continue-' + repository.repoPath);
	this.mergeAbortProgressBar = new ProgressBarViewModel('merge-abort-' + repository.repoPath);
	this.commitValidationError = ko.computed(function() {
		if (!self.amend() && !self.files().some(function(file) { return file.staged(); }))
			return "No files to commit";

		if (self.files().some(function(file) { return file.conflict(); }))
			return "Files in conflict";

		if (!self.commitMessageTitle() && !self.inRebase()) return "Provide a title";
		return "";
	});
}
exports.StagingViewModel = StagingViewModel;
StagingViewModel.prototype.refresh = function() {
	var self = this;
	this.refreshingProgressBar.start();
	this.app.get('/status', { path: this.repoPath }, function(err, status) {
		self.refreshingProgressBar.stop();
		if (err) return;
		self.setFiles(status.files);
		self.inRebase(!!status.inRebase);
		self.inMerge(!!status.inMerge);
		if (status.inMerge) {
			var lines = status.commitMessage.split('\n');
			self.commitMessageTitle(lines[0]);
			self.commitMessageBody(lines.slice(1).join('\n'));
		}
	});
}
StagingViewModel.prototype.setFiles = function(files) {
	var self = this;
	var newFiles = [];
	for(var file in files) {
		var diffViewModel = this.filesByPath[file];
		if (!diffViewModel) {
			if(files[file].type == 'text') {
				this.filesByPath[file] = diffViewModel = new FileViewModel(self);
			} else {
				this.filesByPath[file] = diffViewModel = new ImageViewModel(self);
			}
			diffViewModel.name(file);
		}
		diffViewModel.isNew(files[file].isNew);
		diffViewModel.removed(files[file].removed);
		diffViewModel.conflict(files[file].conflict);
		diffViewModel.invalidateDiff();
		newFiles.push(diffViewModel);
	}
	this.files(newFiles);
}
StagingViewModel.prototype.toogleAmend = function() {
	if (!this.amend() && !this.commitMessageTitle()) {
		this.commitMessageTitle(this.repository.graph.HEAD().title());
		this.commitMessageBody(this.repository.graph.HEAD().body());
	}
	else if(this.amend()) {
		this.commitMessageTitle('');
		this.commitMessageBody('');
	}
	this.amend(!this.amend());
}
StagingViewModel.prototype.commit = function() {
	var self = this;
	this.committingProgressBar.start();
	var files = this.files().filter(function(file) {
		return file.staged();
	}).map(function(file) {
		return file.name();
	});
	var commitMessage = this.commitMessageTitle();
	if (this.commitMessageBody()) commitMessage += '\n\n' + this.commitMessageBody();
	this.app.post('/commit', { path: this.repository.repoPath, message: commitMessage, files: files, amend: this.amend() }, function(err, res) {
		if (err) {
			if (err.errorCode == 'no-git-name-email-configured') {
				self.repository.app.content(new screens.UserErrorViewModel({
					title: 'Git email and/or name not configured',
					details: 'You need to configure your git email and username to commit files.<br> Run <code>git config --global user.name "your name"</code> and <code>git config --global user.email "your@email.com"</code>'
				}));
				return true;
			}
			return;
		}
		self.commitMessageTitle('');
		self.commitMessageBody('');
		self.amend(false);
		self.files([]);
		self.committingProgressBar.stop();
	});
}
StagingViewModel.prototype.rebaseContinue = function() {
	var self = this;
	this.rebaseContinueProgressBar.start();
	this.app.post('/rebase/continue', { path: this.repository.repoPath }, function(err, res) {
		self.rebaseContinueProgressBar.stop();
	});
}
StagingViewModel.prototype.rebaseAbort = function() {
	var self = this;
	this.rebaseAbortProgressBar.start();
	this.app.post('/rebase/abort', { path: this.repository.repoPath }, function(err, res) {
		self.rebaseAbortProgressBar.stop();
	});
}
StagingViewModel.prototype.mergeContinue = function() {
	var self = this;
	this.mergeContinueProgressBar.start();
	var commitMessage = this.commitMessageTitle();
	if (this.commitMessageBody()) commitMessage += '\n\n' + this.commitMessageBody();
	this.app.post('/merge/continue', { path: this.repository.repoPath, message: commitMessage }, function(err, res) {
		self.mergeContinueProgressBar.stop();
	});
}
StagingViewModel.prototype.mergeAbort = function() {
	var self = this;
	this.mergeAbortProgressBar.start();
	this.app.post('/merge/abort', { path: this.repository.repoPath }, function(err, res) {
		self.mergeAbortProgressBar.stop();
	});
}
StagingViewModel.prototype.invalidateFilesDiffs = function() {
	this.files().forEach(function(file) {
		file.invalidateDiff(false);
	});
}
StagingViewModel.prototype.discardAllChanges = function() {
	var self = this;
	var diag = new dialogs.YesNoDialogViewModel('Are you sure you want to discard all changes?', 'This operation cannot be undone.');
	diag.closed.add(function() {
		if (diag.result()) self.app.post('/discardchanges', { path: self.repository.repoPath, all: true });
	});
	this.app.showDialog(diag);
}
StagingViewModel.prototype.toogleAllStages = function() {
	var self = this;
	for (var n in self.files()){
		self.files()[n].staged(self.allStageFlag);
	}
	self.allStageFlag = !self.allStageFlag
}

var DiffViewModel = function(staging) {
	var self = this;
	this.staging = staging;
	this.app = staging.app;
	this.type = 'text';

	this.staged = ko.observable(true);
	this.name = ko.observable();
	this.isNew = ko.observable(false);
	this.removed = ko.observable(false);
	this.conflict = ko.observable(false);
	this.diffs = ko.observable([]);
	this.showingDiffs = ko.observable(false);
	this.diffsProgressBar = new ProgressBarViewModel('diffs-' + this.staging.repository.repoPath);
}
DiffViewModel.prototype.toogleStaged = function() {
	this.staged(!this.staged());
}
DiffViewModel.prototype.discardChanges = function() {
	this.app.post('/discardchanges', { path: this.staging.repository.repoPath, file: this.name() });
}
DiffViewModel.prototype.ignoreFile = function() {
	this.app.post('/ignorefile', { path: this.staging.repository.repoPath, file: this.name() });
}
DiffViewModel.prototype.resolveConflict = function() {
	this.app.post('/resolveconflicts', { path: this.staging.repository.repoPath, files: [this.name()] });
}
DiffViewModel.prototype.toogleDiffs = function() {
	var self = this;
	if (this.showingDiffs()) this.showingDiffs(false);
	else {
		this.showingDiffs(true);
		this.invalidateDiff(true);
	}
}
DiffViewModel.prototype.invalidateDiff = function(drawProgressBar) {
	var self = this;
	if (this.showingDiffs()) {
		if (drawProgressBar) this.diffsProgressBar.start();
		var isTextType = this.type == 'text' ? true : false;
		this.app.get(isTextType ? '/filediff' : '/imagediff', { file: this.name(), path: this.staging.repository.repoPath }, function(err, diffs) {
			if (drawProgressBar) self.diffsProgressBar.stop();
			if (err) return;
			var newDiffs = [];
			diffs.forEach(function(diff) {
				diff.lines.forEach(function(line) {
					if (isTextType) {
						newDiffs.push({
							oldLineNumber: line[0],
							newLineNumber: line[1],
							added: line[2][0] == '+',
							removed: line[2][0] == '-' || line[2][0] == '\\',
							text: line[2]
						});
					} else {
                                                newDiffs.push({
                                                        added: line[2][0] == '+',
                                                        removed: line[2][0] == '-' || line[2][0] == '\\',
                                                        text: line[2]
                                                });
					}
				});
			});
			self.diffs(newDiffs);
		});
	}
}

var FileViewModel = function (staging) {
	DiffViewModel.call(this, staging);
	this.type = 'text';
	this.templateName = 'textFileDiff';
}
inherits(FileViewModel, DiffViewModel);

var ImageViewModel = function(staging) {
	DiffViewModel.call(this, staging);
	this.type = 'html';
	this.templateName = 'imageFileDiff';
}
inherits(ImageViewModel, DiffViewModel);
