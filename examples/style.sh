#!/usr/bin/env bash
# style and join: build a layout from styled blocks.

TITLE=$(gum style --foreground 212 --border double --border-foreground 212 \
  --align center --width 40 --padding "1 2" "Bubble Gum (1¢)" "So sweet and so fresh!")

LEFT=$(gum style --border rounded --border-foreground 99 --padding "1 3" --width 18 "Bubbletea")
RIGHT=$(gum style --border rounded --border-foreground 86 --padding "1 3" --width 18 "Lipgloss")

gum join --vertical --align center "$TITLE" "$(gum join "$LEFT" "  " "$RIGHT")"
