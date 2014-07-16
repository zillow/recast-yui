'use strict';

var inherits = require('inherits');
var chalk = require('chalk');
var jsdiff = require('diff');

function colorDiff(expect, actual) {
    var str = [];
    // jsdiff.diffWordsWithSpace(expect, actual).forEach(function (part) {
    // jsdiff.diffWords(expect, actual).forEach(function (part) {
    jsdiff.diffLines(expect, actual).forEach(function (part) {
        var color = part.added ? 'green' : part.removed ? 'red' : 'grey';
        str.push(chalk[color](part.value));
    });
    return str.join('');
}

inherits(ConfigMismatch, Error);
function ConfigMismatch(header, loaderBlock, configBlock) {
    this.message = [
        header,
        [chalk.red('loader'), chalk.grey(' <> '), chalk.green('module')].join(''),
        loaderBlock ? colorDiff(loaderBlock, configBlock) : chalk.green(configBlock)
    ].join('\n');

    this.name = 'ConfigMismatch';

    Error.captureStackTrace(this, ConfigMismatch);
}

exports.ConfigMismatch = ConfigMismatch;
