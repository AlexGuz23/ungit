'use strict';
const environment = require('./environment')({
  serverStartupOptions: ['--no-disableDiscardWarning'],
  rootPath: '/deep/root/path/to/app',
});
const mkdirp = require('mkdirp');
const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const testRepoPaths = [];

const changeTestFile = async (filename, repoPath) => {
  await environment.backgroundAction('POST', `/api/testing/changefile`, {
    file: filename,
    path: repoPath,
  });
};
const checkout = async (branch) => {
  await environment.click(`.branch[data-ta-name="${branch}"]`);
  await environment.click('[data-ta-action="checkout"]:not([style*="display: none"]) .dropmask');
  await environment.waitForElementVisible(`.ref.branch[data-ta-name="${branch}"].current`);
};
const amendCommit = async () => {
  try {
    await environment.page.waitForSelector('.amend-button', { visible: true, timeout: 2000 });
    await environment.click('.amend-button');
  } catch (err) {
    await environment.click('.amend-link');
  }
  await environment.click('.commit-btn');
  await environment.waitForElementHidden('.files .file .btn-default');
};

describe('[GENERIC]', () => {
  before('Environment init', async () => {
    await environment.init();
    await environment.createRepos(testRepoPaths, [{ bare: false }]);

    // create a sub dir and change working dir to sub dir to prove functionality within subdir
    testRepoPaths.push(`${testRepoPaths[0]}/asubdir`);
    await rimraf(testRepoPaths[1]);
    await mkdirp(testRepoPaths[1]);
  });
  after('Environment stop', () => environment.shutdown());

  it('Open repo screen', () => {
    return environment.openUngit(testRepoPaths[1]);
  });

  it('Check for refresh button', () => {
    return environment.click('.refresh-button');
  });

  it('Should be possible to create and commit a file', async () => {
    await environment.createTestFile(`${testRepoPaths[0]}/testfile.txt`, testRepoPaths[0]);
    await environment.commit('Init');
    await environment.waitForElementVisible('.commit');
  });

  it('Should be possible to amend a file', async () => {
    await environment.createTestFile(`${testRepoPaths[0]}/testfile.txt`, testRepoPaths[0]);
    await environment.waitForElementVisible('.files .file .btn-default');
    await amendCommit();
    await environment.waitForElementVisible('.commit');
  });

  it('Should be possible to cancel amend a file', async () => {
    await environment.click('.amend-link');
    await environment.click('.btn-stg-cancel');
    await environment.waitForElementVisible('.empty-commit-link');
  });

  it('Should be able to add a new file to .gitignore', async () => {
    await environment.createTestFile(`${testRepoPaths[0]}/addMeToIgnore.txt`, testRepoPaths[0]);
    await environment.waitForElementVisible('.files .file .btn-default');
    await environment.click('.files button.ignore');
    await environment.wait(2000);
    await environment.click('.files button.ignore');
    await environment.waitForElementHidden('.files .file .btn-default');
  });

  it('Test showing commit diff between two commits', async () => {
    await environment.click('[data-ta-clickable="node-clickable-0"]');
    await environment.waitForElementVisible('.diff-wrapper');
    await environment.click('.commit-diff-filename');
    await environment.waitForElementVisible('.commit-line-diffs');
  });

  it('Test showing commit side by side diff between two commits', async () => {
    await environment.click('.commit-sideBySideDiff');
    await environment.waitForElementVisible('.commit-line-diffs');
  });

  it('Test wordwrap', async () => {
    await environment.click('.commit-wordwrap');
    await environment.waitForElementVisible('.word-wrap');
  });

  it('Test whitespace', async () => {
    await environment.click('.commit-whitespace');
    await environment.waitForElementVisible('.commit-line-diffs');
    await environment.click('[data-ta-clickable="node-clickable-0"]');
  });

  it('Should be possible to discard a created file and ensure patching is not available for new file', async () => {
    await environment.createTestFile(`${testRepoPaths[0]}/testfile2.txt`, testRepoPaths[0]);
    await environment.waitForElementVisible('.files .file .btn-default');
    await environment.click('.files button');
    await environment.waitForElementHidden('[data-ta-container="patch-file"]');
    await environment.click('.files button.discard');
    await environment.click('.modal-dialog .btn-primary');
    await environment.waitForElementHidden('.files .file .btn-default');
  });

  it('Should be possible to create a branch', () => {
    return environment.createBranch('testbranch');
  });

  it('Should be possible to create and destroy a branch', async () => {
    await environment.createBranch('willbedeleted');
    await environment.click('.branch[data-ta-name="willbedeleted"]');
    await environment.click('[data-ta-action="delete"]:not([style*="display: none"]) .dropmask');
    await environment.click('.modal-dialog .btn-primary');
    await environment.waitForElementHidden('.branch[data-ta-name="willbedeleted"]');
  });

  it('Should be possible to create and destroy a tag', async () => {
    await environment.createTag('tagwillbedeleted');
    await environment.click('.graph .ref.tag[data-ta-name="tagwillbedeleted"]');
    await environment.click('[data-ta-action="delete"]:not([style*="display: none"]) .dropmask');
    await environment.click('.modal-dialog .btn-primary');
    await environment.waitForElementHidden('.graph .ref.tag[data-ta-name="tagwillbedeleted"]');
  });

  it('Commit changes to a file', async () => {
    await changeTestFile(`${testRepoPaths[0]}/testfile.txt`, testRepoPaths[0]);
    await environment.waitForElementVisible('.files .file .btn-default');
    await environment.insert('.staging input.form-control', 'My commit message');
    await environment.click('.commit-btn');
    await environment.waitForElementHidden('.files .file .btn-default');
  });

  it('Show stats for changed file and discard it', async () => {
    await changeTestFile(`${testRepoPaths[0]}/testfile.txt`, testRepoPaths[0]);
    await environment.waitForElementVisible('.files .file .additions');
    await environment.waitForElementVisible('.files .file .deletions');

    await environment.click('.files button.discard');
    await environment.click('.modal-dialog .btn-primary');
    await environment.waitForElementHidden('.files .file .btn-default');
  });

  it.skip('Should be possible to patch a file', async () => {
    await changeTestFile(`${testRepoPaths[0]}/testfile.txt`, testRepoPaths[0]);
    //   .patch('patch')
    environment.waitForElementVisible('.commit');
  });

  it('Checkout a branch', () => {
    return checkout('testbranch');
  });

  it('Create another commit', async () => {
    await environment.createTestFile(`${testRepoPaths[0]}/testy2.txt`, testRepoPaths[0]);
    await environment.commit('Branch commit');
  });

  it('Rebase', () => {
    return environment.refAction('testbranch', true, 'rebase');
  });

  it('Checkout master again', () => {
    return checkout('master');
  });

  it('Create yet another commit', async () => {
    await environment.createTestFile(`${testRepoPaths[0]}/testy3.txt`, testRepoPaths[0]);
    await environment.commit('Branch commit');
  });

  it('Merge', () => {
    return environment.refAction('testbranch', true, 'merge');
  });

  it('Revert merge', async () => {
    await environment.click('[data-ta-clickable="node-clickable-0"]');
    await environment.waitForElementVisible('[data-ta-action="revert"]');
    await environment.click('[data-ta-action="revert"]');
    await environment.waitForElementVisible(
      '[data-ta-node-title="Revert \\"Merge branch \'testbranch\'\\""]'
    );
  });

  it('Should be possible to move a branch', async () => {
    await environment.createBranch('movebranch');
    await environment.moveRef('movebranch', 'Init');
  });

  it('Should be possible to cancel creation of an empty commit', async () => {
    await environment.click('.empty-commit-link');
    await environment.click('.btn-stg-cancel');
    await environment.waitForElementVisible('.empty-commit-link');
  });

  it('Should be possible to create an empty commit', async () => {
    await environment.click('.empty-commit-link');
    await environment.click('.commit-btn');
    await environment.waitForElementVisible('.commit');
  });

  it('Should be possible to amend an empty commit', async () => {
    await environment.click('.empty-commit-link');
    await environment.click('.commit-btn');
    await environment.waitForElementVisible('.commit');
    await amendCommit();
    await environment.waitForElementVisible('.commit');
  });

  it('Should be possible to cancel amend of an empty commit', async () => {
    await environment.click('.amend-link');
    await environment.click('.btn-stg-cancel');
    await environment.waitForElementVisible('.empty-commit-link');
  });

  it('Should be possible to click refresh button', () => {
    return environment.click('button.refresh-button');
  });

  it('Go to home screen', async () => {
    await environment.click('.navbar .backlink');
    await environment.waitForElementVisible('.home');
  });
});
