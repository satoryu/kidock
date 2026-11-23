# Kidock

[![CI](https://github.com/satoryu/kidock/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/satoryu/kidock/actions/workflows/ci.yml)

Kidock — the dock where your agents' work arrives.

> **Status: early development.** Nothing is usable yet, and features and the tech stack may change.

## Overview

AI agents such as Claude Code often write their results as Markdown files into local folders. Kidock is a read-only desktop viewer for those deliverables:

- Register multiple folders and browse them as trees in a sidebar.
- New or updated Markdown files are flagged as unread, with per-folder unread badges and OS notifications.
- Rendering supports GitHub Flavored Markdown, syntax-highlighted code, Mermaid diagrams, and images/links via relative paths.
- The open file re-renders automatically when an agent updates it.

The name comes from the Japanese 既読 (*kidoku*, "already read") + *dock*.

Kidock targets Windows and macOS. It does not edit files.

## License

[MIT](LICENSE)
