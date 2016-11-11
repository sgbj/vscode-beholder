'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as npm from 'npm';
import * as util from 'util';
import * as semver from 'semver';
import * as child_process from 'child_process';
import * as path from 'path';


function checkStatuses(options, done: (statuses: any[]) => void) {
    let pkgs = options.packages.slice();
    let statuses = [];
    let current;

    npm.load(config => {


        child_process.exec('npm ls --json=true --depth=0', { cwd: options.dirname }, (error, stdout, stderr) => {

            let ls = JSON.parse(stdout);

            let check = (err, result) => {
                if (err) {
                    console.log(err);
                    vscode.window.showErrorMessage(`An error occurred while retrieving information about package ${current.name}.`);
                    return;
                }

                let latest = Object.keys(result)[0];
                statuses.push({
                    name: result[latest].name,
                    current: current.version,
                    latest: latest
                });

                current = pkgs.shift();
                if (current) {
                    if (ls.dependencies[current.name].version) {
                        current.version = ls.dependencies[current.name].version;
                    }
                    npm.commands.view([current.name], check);
                } else {
                    done(statuses);
                }
            };

            current = pkgs.shift();
            if (current) {
                if (ls.dependencies[current.name].version) {
                    current.version = ls.dependencies[current.name].version;
                }
                npm.commands.view([current.name], check);
            } else {
                done(statuses);
            }
        });
    });


    
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error).
    // This line of code will only be executed once when your extension is activated.
    console.log('Congratulations, your extension "vscode-beholder" is now active!');

    

    // create a new word counter
    let beholder = new Beholder();
    let controller = new BeholderController(beholder);

    let disposable = vscode.commands.registerCommand('extension.showReport', () => {
        beholder.showReport();
    });

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(controller);
    context.subscriptions.push(beholder);
    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

class Beholder {

    private _statusBarItem: vscode.StatusBarItem;
    private results;

    public showReport() {
        if (this.results && this.results.outdated.length) {
            let items = this.results.outdated.map(p => `${p.name} - current: ${p.current} - latest: ${p.latest}`);
            items.push('Update all dependencies...');
            vscode.window.showQuickPick(items, {
                placeHolder: 'Update a dependency'
            });
        }
    }

    public updateStatus() {

        // Create as needed
        if (!this._statusBarItem) {
            this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
            this._statusBarItem.command = 'extension.showReport';
            this._statusBarItem.text = '$(package) init...';
        }

        // Get the current text editor
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            this._statusBarItem.hide();
            return;
        }

        let doc = editor.document;

        // Only update if it's a package.json file
        if (/package.json$/.test(doc.fileName)) {
            let dirname = path.dirname(doc.fileName);
            
            // parse respective file to find a list of packages and versions, then call this with the list of packages.
            // this method should return a report object with a status text field, but more in depth info for the report
             this._statusBarItem.text = '$(package) scanning...';

            let status = this._getStatus({ doc, dirname }, results => {

                this.results = results;

                this._statusBarItem.text = results.description;
            });

            // Update the status bar
           
            this._statusBarItem.show();
        } else { 
            this._statusBarItem.hide();
        }
    }

    public _getStatus(options, done: (results: any) => void) {

        let docContent = options.doc.getText();

        let obj = JSON.parse(docContent);

        let packages = [];

        for (let key of Object.keys(obj.dependencies)) {
            packages.push({
                name: key,
                version: obj.dependencies[key]
            });
        }

        checkStatuses({ packages, dirname: options.dirname }, statuses => {
            let description = '$(package) up to date';

            let outdated = statuses.filter(s => !semver.satisfies(s.latest, s.current));
            console.log(outdated);

            if (outdated.length) {
                description = '$(package) out of date';
            }

            done({
                description,
                statuses,
                outdated
            });
        });
    }

    dispose() {
        this._statusBarItem.dispose();
    }
}

class BeholderController {

    private _beholder: Beholder;
    private _disposable: vscode.Disposable;

    constructor(beholder: Beholder) {
        this._beholder = beholder;

        // subscribe to selection change and editor activation events
        let subscriptions: vscode.Disposable[] = [];
        //vscode.window.onDidChangeTextEditorSelection(this._onEvent, this, subscriptions);
        vscode.window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

        // update the counter for the current file
        this._beholder.updateStatus();

        // create a combined disposable from both event subscriptions
        this._disposable = vscode.Disposable.from(...subscriptions);
    }

    dispose() {
        this._disposable.dispose();
    }

    private _onEvent() {
        this._beholder.updateStatus();
    }
}