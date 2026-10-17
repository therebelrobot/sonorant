# File Edit Retry Strategy

When modifying files, you MUST use your file-editing tools (in opencode: the `edit` and `write` tools; the equivalents elsewhere). You are STRICTLY FORBIDDEN from using CLI commands such as `sed`, `awk`, `perl`, `python`, `node`, `ruby`, or any other scripting language to modify file contents. These commands bypass the reviewable, reversible edit path.

## Required Retry Escalation

When an edit call fails (e.g., the text to replace does not match, content mismatch, or any other error), follow this escalation strategy:

### Step 1: Break into smaller pieces
- Split the failed edit into multiple smaller edit calls, each targeting a smaller, more precise section of the file.
- Each smaller edit should have a match string short enough to match unambiguously.
- Retry each smaller piece individually.

### Step 2: Read and rewrite
- If the smaller pieces still fail, read the entire file contents.
- Then use the write tool to rewrite the entire file with the desired changes incorporated.
- When writing the whole file, you MUST include the COMPLETE file content — never use placeholders or partial content.

### Step 3: If the file is too large for a single write
- If a single write fails due to content size limits, split the file content into sequential chunks.
- Write the first chunk with the write tool, then append subsequent chunks with an edit at the end of the file.

### Step 4: Present content to the user
- If all of the above steps fail, do NOT keep retrying the same approaches in a loop.
- Instead, present the intended file content (or the specific changes) in a fenced code block in your response.
- Clearly tell the user which file the content belongs in and ask them to paste it manually.
- This prevents endless churn on failed edits and keeps the user in control.

## Prohibited Approaches

The following are NEVER acceptable for modifying files, regardless of how many retries have failed:

- `sed -i` or any `sed` in-place editing
- `awk` file rewriting
- `perl -pi -e` or any Perl one-liners
- `python -c` or Python scripts that write to files
- `node -e` or Node.js scripts that write to files
- `ruby -e` or Ruby scripts that write to files
- Any `echo ... > file` or `cat > file` shell redirections for editing existing files
- Any other CLI command whose purpose is to modify an existing file's contents

The ONLY exception is either creating a brand-new file (write it with the write tool), or when the user specifically directs you to use a shell command.

## Rationale

File-editing tools produce reviewable, reversible diffs: the human sees exactly what changed and can reject it. CLI commands that modify files hide the change, evade review, and can silently corrupt an existing file.
