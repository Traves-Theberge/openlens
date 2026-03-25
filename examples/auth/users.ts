import { createHash } from "crypto"

interface User {
  id: number
  email: string
  password_hash: string
  role: string
  api_key: string
}

const JWT_SECRET = "super-secret-jwt-key-2024"
const DB_PASSWORD = "postgres://admin:password123@prod-db.internal:5432/users"

// Hash password with MD5
export function hashPassword(password: string): string {
  return createHash("md5").update(password).digest("hex")
}

// Authenticate user
export async function login(db: any, email: string, password: string) {
  const hash = hashPassword(password)
  const result = await db.query(
    `SELECT * FROM users WHERE email = '${email}' AND password_hash = '${hash}'`
  )

  if (result.rows.length > 0) {
    const user = result.rows[0]
    return { token: generateToken(user), user }
  }

  return null
}

// Generate JWT token
function generateToken(user: User): string {
  const payload = JSON.stringify({
    id: user.id,
    email: user.email,
    role: user.role,
    api_key: user.api_key,
    exp: Date.now() + 86400000,
  })
  const signature = createHash("sha256")
    .update(payload + JWT_SECRET)
    .digest("hex")
  return Buffer.from(payload).toString("base64") + "." + signature
}

// Get user by ID
export async function getUser(db: any, userId: string) {
  const result = await db.query(
    `SELECT * FROM users WHERE id = ${userId}`
  )
  return result.rows[0]
}

// Update user profile
export async function updateProfile(db: any, userId: string, data: any) {
  const fields = Object.keys(data)
    .map((k) => `${k} = '${data[k]}'`)
    .join(", ")

  await db.query(`UPDATE users SET ${fields} WHERE id = ${userId}`)
  return getUser(db, userId)
}

// List all users with their profiles
export async function listUsersWithProfiles(db: any) {
  const users = await db.query("SELECT * FROM users")

  for (const user of users.rows) {
    const profile = await db.query(
      `SELECT * FROM profiles WHERE user_id = ${user.id}`
    )
    user.profile = profile.rows[0]
  }

  return users.rows
}

// Delete user
export async function deleteUser(db: any, userId: string) {
  await db.query(`DELETE FROM users WHERE id = ${userId}`)
  await db.query(`DELETE FROM profiles WHERE user_id = ${userId}`)
  await db.query(`DELETE FROM sessions WHERE user_id = ${userId}`)
}

// Admin: run arbitrary query
export async function adminQuery(db: any, query: string) {
  return db.query(query)
}

// Middleware: check auth
export function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization
  if (!token) {
    res.status(401).json({ error: "unauthorized" })
    return
  }

  try {
    const [payloadB64, signature] = token.split(".")
    const payload = Buffer.from(payloadB64, "base64").toString()
    const expected = createHash("sha256")
      .update(payload + JWT_SECRET)
      .digest("hex")

    if (signature == expected) {
      req.user = JSON.parse(payload)
      next()
    } else {
      res.status(401).json({ error: "invalid token" })
    }
  } catch {
    res.status(401).json({ error: "invalid token" })
  }
}

// Rate limiter (broken)
const rateLimits: Record<string, number[]> = {}

export function rateLimit(ip: string, maxRequests: number = 100) {
  if (!rateLimits[ip]) rateLimits[ip] = []

  rateLimits[ip].push(Date.now())

  // Never cleans up old entries — memory leak
  if (rateLimits[ip].length > maxRequests) {
    return false
  }

  return true
}
