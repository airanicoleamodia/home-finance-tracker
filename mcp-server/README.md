# Home Finance Tracker — Claude MCP server

Lets Claude read, add, and edit your household expenses by chat.

## Install

```bash
cd mcp-server
npm install
cp .env.example .env   # then fill in the values
```

Fill `.env`:

- `SUPABASE_URL` — your project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API → **service_role** (keep secret).
- `HOUSEHOLD_ID` — Supabase → Table editor → `households` → copy the row `id`.
- `DEFAULT_PROFILE_ID` — (optional) a `profiles` row id used when Claude adds an expense without naming who paid.

## Connect to Claude Desktop

Add this to your Claude Desktop MCP config
(`claude_desktop_config.json` → `mcpServers`):

```json
{
  "mcpServers": {
    "home-finance": {
      "command": "node",
      "args": ["ABSOLUTE/PATH/TO/mcp-server/server.js"],
      "env": {
        "SUPABASE_URL": "https://YOURPROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
        "HOUSEHOLD_ID": "your-household-uuid",
        "DEFAULT_PROFILE_ID": "your-profile-uuid"
      }
    }
  }
}
```

Restart Claude. You can then say things like:

- "How much did we spend on groceries this month?"
- "Add a ₱450 transport expense for today."
- "Are we over budget anywhere?"
- "List this month's expenses."

## Tools exposed

`list_expenses`, `add_expense`, `edit_expense`, `delete_expense`,
`spending_summary`, `check_budgets`, `manage_categories`.

## Security note

The service role key bypasses row-level security, so this server is
hard-scoped to the single `HOUSEHOLD_ID` you configure. Keep the key
secret and never put it in the frontend app.
