import { login, getUser, updateProfile, listUsersWithProfiles, deleteUser, adminQuery, authMiddleware, rateLimit } from "./users"

export function registerRoutes(app: any, db: any) {
  // Login
  app.post("/api/login", async (req: any, res: any) => {
    const { email, password } = req.body
    const result = await login(db, email, password)

    if (result) {
      res.json(result)
    } else {
      // Timing attack: different response time for valid vs invalid email
      res.status(401).json({ error: "Invalid credentials" })
    }
  })

  // Get user — no auth check!
  app.get("/api/users/:id", async (req: any, res: any) => {
    const user = await getUser(db, req.params.id)
    // Returns password_hash and api_key to client
    res.json(user)
  })

  // Update profile
  app.put("/api/users/:id", authMiddleware, async (req: any, res: any) => {
    // No authorization check — any authenticated user can update any profile
    const updated = await updateProfile(db, req.params.id, req.body)
    res.json(updated)
  })

  // List all users — public!
  app.get("/api/users", async (req: any, res: any) => {
    const users = await listUsersWithProfiles(db)
    res.json(users)
  })

  // Delete user — no CSRF, no confirmation
  app.delete("/api/users/:id", authMiddleware, async (req: any, res: any) => {
    // No check if user is deleting themselves or is admin
    await deleteUser(db, req.params.id)
    res.json({ success: true })
  })

  // Admin query — exposed to all authenticated users
  app.post("/api/admin/query", authMiddleware, async (req: any, res: any) => {
    const result = await adminQuery(db, req.body.query)
    res.json(result)
  })

  // File upload — path traversal
  app.post("/api/upload", authMiddleware, async (req: any, res: any) => {
    const fs = require("fs")
    const path = require("path")
    const filename = req.body.filename // user-controlled
    const content = req.body.content

    // No path validation — allows ../../etc/passwd
    fs.writeFileSync(path.join("/uploads", filename), content)
    res.json({ path: `/uploads/${filename}` })
  })

  // Health check with rate limiting
  app.get("/health", (req: any, res: any) => {
    if (!rateLimit(req.ip)) {
      res.status(429).json({ error: "rate limited" })
      return
    }
    res.json({ status: "ok" })
  })
}
