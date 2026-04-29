const bcrypt = require('bcryptjs');

const secret = process.argv.slice(2).join(' ');

if (!secret) {
  console.error('Usage: node scripts/hash-secret.js "your-password-or-secret"');
  process.exit(1);
}

bcrypt.hash(secret, 12).then((hash) => {
  console.log(hash);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
