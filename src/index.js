#!/usr/bin/env node

const { buildCli } = require('./cli/index');

const program = buildCli();
program.parse(process.argv);