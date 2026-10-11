# tab-alert

A Claude Code mod that flashes your terminal tab while Claude waits on you.

It flashes when:

- Claude asks for permission to run something
- Claude asks you a question
- an MCP server asks you for input

## How it flashes

- **tmux:** the window's tab flashes red. It stops when you switch to that window.
- **Warp, iTerm2 and others:** the tab title flashes `● Claude needs you`. It stops when you answer or type.

FYI: in Warp, a tab you renamed by hand keeps its name, so the title flash does not show there.

## Install

```
/plugin marketplace add NeonOrchard/tab-alert
/plugin install tab-alert@tab-alert
```
