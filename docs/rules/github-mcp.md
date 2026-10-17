# GitHub MCP Server Preference

When performing GitHub operations (creating/updating PRs, managing issues, reading repository data, etc.), you MUST use the GitHub MCP server tools rather than the `gh` CLI.

## Required Behavior

1. **Always use the GitHub MCP server** for all GitHub API operations including but not limited to:
   - Creating, updating, or reading pull requests
   - Creating, updating, or reading issues
   - Managing labels, milestones, and projects
   - Reading repository metadata, branches, and commits
   - Creating or updating PR reviews and comments
   - Managing releases and tags

2. **Do NOT use the `gh` CLI** (GitHub CLI) for any operations that the GitHub MCP server can handle. The MCP server provides structured, reliable access to the GitHub API with proper error handling.

3. **If the GitHub MCP server is not available** (tools are not listed, connection errors, or the server is not configured):
   - **Stop and prompt the user** to configure the GitHub MCP server
   - Explain that the GitHub MCP server is required for GitHub operations
   - Do NOT fall back to the `gh` CLI silently
   - Suggest the user check their MCP server configuration in their agent's MCP settings

## Exception

The `gh` CLI may be used ONLY for operations that the GitHub MCP server does not support (e.g., `gh auth status` for debugging authentication issues). In such cases, clearly state why the MCP server cannot be used for that specific operation.
