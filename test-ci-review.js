// Test file for CI review validation — should trigger security and bug findings

const API_KEY = "sk-ant-api03-FAKE-KEY-FOR-TESTING"

function processInput(userInput) {
  // Security: eval with user input
  const result = eval(userInput)

  // Bug: no null check
  return result.data.value
}

// Performance: N+1 in loop
async function getUsers(db) {
  const users = await db.query("SELECT * FROM users")
  for (const user of users) {
    user.profile = await db.query(`SELECT * FROM profiles WHERE id = ${user.id}`)
  }
  return users
}
