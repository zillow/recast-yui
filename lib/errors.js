'use strict';

var inherits = require('inherits');
var chalk = require('chalk');
var jsdiff = require('diff');

function colorPatch(data, expect, actual) {
    return jsdiff.createPatch(data.moduleFile, expect || '', actual)
        .split('\n')
        .map(function (line) {
            var c = line.charAt(0);
            if (c === '-') {
                // line removed
                if (line.charAt(2) === '-') {
                    // --- filename (loader)
                    line = line.replace(data.moduleFile, data.groupFile);
                }
                line = chalk.red(line);
            }
            else if (c === '+') {
                // line added
                line = chalk.green(line);
            }
            else {
                // context or header
                if (c === 'I') {
                    // Index: filename
                    line = 'ERROR: Mismatched config in module "' + data.moduleName + '" of group "' + data.groupName + '"';
                }
                line = chalk.grey(line);
            }
            return line;
        })
        .join('\n');
}

inherits(ConfigMismatch, Error);
function ConfigMismatch(data, loaderBlock, configBlock) {
    this.message = colorPatch(data, loaderBlock, configBlock);
    this.name = 'ConfigMismatch';
    Error.captureStackTrace(this, ConfigMismatch);
}

exports.ConfigMismatch = ConfigMismatch;
