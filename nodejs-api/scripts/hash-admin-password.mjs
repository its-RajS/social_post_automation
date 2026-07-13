import { randomBytes, scrypt } from 'node:crypto'

const password = process.argv[2]
if (!password || password.length < 8) {
  console.error('Usage: npm run admin:hash-password -- "a-password-with-at-least-8-characters"')
  process.exit(1)
}

const salt = randomBytes(16).toString('hex')
scrypt(password, salt, 64, (error, key) => {
  if (error) throw error
  console.log(`${salt}:${key.toString('hex')}`)
})
