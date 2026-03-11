// Generates a secure random API key and prints it to stdout
const crypto = require('crypto');
console.log(crypto.randomBytes(32).toString('hex'));
