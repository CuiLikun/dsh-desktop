const { app } = require('electron');
const setup = process.argv.includes('--setup') || (!process.argv.includes('--desktop') && (!app.isPackaged || Boolean(process.env.PORTABLE_EXECUTABLE_FILE)));
require(setup ? './setup-main.cjs' : './desktop-main.cjs');
