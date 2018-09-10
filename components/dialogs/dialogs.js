
const ko = require('knockout');
const inherits = require('util').inherits;
const components = require('ungit-components');
const Bluebird = require('bluebird');
const programEvents = require('ungit-program-events');

components.register('formdialog', args => new FormDialogViewModel(args.title));
components.register('credentialsdialog', args => new CredentialsDialogViewModel({remote: args.remote}));
components.register('addremotedialog', args => new AddRemoteDialogViewModel());
components.register('addsubmoduledialog', args => new AddSubmoduleDialogViewModel());
components.register('promptdialog', args => new PromptDialogViewModel(args.title, args.details));
components.register('yesnodialog', args => new YesNoDialogViewModel(args.title, args.details));
components.register('yesnomutedialog', args => new YesNoMuteDialogViewModel(args.title, args.details));
components.register('toomanyfilesdialogviewmodel', args => new TooManyFilesDialogViewModel(args.title, args.details));
components.register('texteditdialog', args => new TextEditDialog(args.title, args.content));

class DialogViewModel {
  constructor(title) {
    const self = this;
    this.onclose = null;
    this.title = ko.observable(title);
    this.taDialogName = ko.observable('');
    this.closePromise = new Bluebird(resolve => {
      self.onclose = resolve;
    });
  }

  closeThen(thenFunc) {
    this.closePromise = this.closePromise.then(thenFunc);
    return this;
  }

  setCloser(closer) {
    this.closer = closer;
  }

  close() {
    this.closer();
  }

  show() {
    programEvents.dispatch({ event: 'request-show-dialog', dialog: this });
    return this;
  }
}

class FormDialogViewModel extends DialogViewModel {
  constructor(title) {
    super(title);
    this.items = ko.observable([]);
    this.isSubmitted = ko.observable(false);
    this.showCancel = ko.observable(true);
  }

  submit() {
    this.isSubmitted(true);
    close();
  }
}
FormDialogViewModel.prototype.template = 'formDialog';

class CredentialsDialogViewModel extends FormDialogViewModel {
  constructor(args) {
    super();
    this.title(`Remote ${args.remote} requires authentication`);
    this.taDialogName('credentials-dialog');
    this.showCancel(false);
    this.username = ko.observable();
    this.password = ko.observable();
    this.items([
      { name: 'Username', value: this.username, placeholder: 'Username', type: 'text', autofocus: true, taName: 'username' },
      { name: 'Password', value: this.password, placeholder: 'Password', type: 'password', autofocus: false, taName: 'password' }
    ]);
  }
}

class AddRemoteDialogViewModel extends FormDialogViewModel {
  constructor() {
    super();
    this.title('Add new remote');
    this.taDialogName('add-remote');
    this.name = ko.observable();
    this.url = ko.observable();
    this.items([
      { name: 'Name', value: this.name, placeholder: 'Name', type: 'text', autofocus: true, taName: 'name' },
      { name: 'Url', value: this.url, placeholder: 'Url', type: 'text', autofocus: false, taName: 'url' }
    ]);
  }
}

class AddSubmoduleDialogViewModel extends FormDialogViewModel {
  constructor() {
    super();
    this.title('Add new submodule');
    this.taDialogName('add-submodule');
    this.path = ko.observable();
    this.url = ko.observable();
    this.items([
      { name: 'Path', value: this.path, placeholder: 'Path', type: 'text', autofocus: true, taName: 'path' },
      { name: 'Url', value: this.url, placeholder: 'Url', type: 'text', autofocus: false, taName: 'url' }
    ]);
  }
}

class PromptDialogViewModel extends DialogViewModel {
  constructor(title, details) {
    super(title);
    this.alternatives = ko.observable();
    this.details = ko.observable(details);
  }
}
PromptDialogViewModel.prototype.template = 'prompt';

class YesNoDialogViewModel extends PromptDialogViewModel {
  constructor(title, details) {
    super(title, details);
    this.taDialogName('yes-no-dialog');
    this.result = ko.observable(false);
    const self = this;
    console.log(333, this, close, this.close)
    this.alternatives([
      { label: 'Yes', primary: true, taId: 'yes', click() { self.result(true); self.close(); } },
      { label: 'No', primary: false, taId: 'no', click() { self.result(false); self.close(); } },
    ]);
  }
}

class YesNoMuteDialogViewModel extends PromptDialogViewModel {
  constructor(title, details) {
    super(title, details);
    this.taDialogName('yes-no-mute-dialog');
    this.result = ko.observable(false);
    const self = this;
    this.alternatives([
      { label: 'Yes', primary: true, taId: 'yes', click() { self.result(true); self.close(); } },
      { label: 'Yes and mute for awhile', primary: false, taId: 'mute', click() { self.result("mute"); this.self.close() } },
      { label: 'No', primary: false, taId: 'no', click() { self.result(false); self.close(); } }
    ]);
  }
}

class TooManyFilesDialogViewModel extends PromptDialogViewModel {
  constructor(title, details) {
    super(title, details);
    this.taDialogName('yes-no-dialog');
    this.result = ko.observable(false);
    const self = this;
    this.alternatives([
      { label: "Don't load", primary: true, taId: 'noLoad', click() { self.result(false); self.close(); } },
      { label: 'Load anyway', primary: false, taId: 'loadAnyway', click() { self.result(true); self.close(); } },
    ]);
  }
}

class TextEditDialog extends PromptDialogViewModel {
  constructor(title, content) {
    super(title, `<textarea class="text-area-content" rows="30" cols="75" style="height:250px;width: 100%">${content}</textarea>`);
    this.taDialogName('text-edit-dialog');
    this.result = ko.observable(false);
    const self = this;
    this.alternatives([
      {
        label: "Save", primary: true, taId: 'save', click() {
          this.textAreaContent = document.querySelector('.modal-body .text-area-content').value;
          self.result(true);
          self.close();
        }
      },
      { label: 'Cancel', primary: false, taId: 'cancel', click() { self.result(false); self.close(); } },
    ]);
  }
}
