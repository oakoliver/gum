#!/usr/bin/env bash
# A conventional-commit helper, the classic gum demo. Prints the git command
# instead of running it.

TYPE=$(gum choose --header "Type of change" fix feat docs style refactor test chore)
SCOPE=$(gum input --placeholder "scope")
[ -n "$SCOPE" ] && SCOPE="($SCOPE)"

SUMMARY=$(gum input --value "$TYPE$SCOPE: " --placeholder "Summary of this change")
DESCRIPTION=$(gum write --placeholder "Details of this change (ctrl+j for a new line)")

gum confirm "Commit changes?" &&
  gum style --border rounded --border-foreground 212 --padding "0 1" \
    "git commit -m \"$SUMMARY\" -m \"$DESCRIPTION\""
