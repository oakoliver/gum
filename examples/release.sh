#!/usr/bin/env bash
# Logs, spinners and a table, as a release script would use them.

gum log --level info "Starting release" version 1.1.0
gum spin --spinner dot --title "Running tests..." -- sleep 1.5
gum log --level warn "2 tests skipped" suite tty
gum spin --spinner moon --title "Building packages..." -- sleep 1.5
gum log --level info "Built" packages 4

PACKAGE=$(printf 'package,version,size\nlipgloss,1.1.0,96 kB\nbubbletea,1.1.0,121 kB\nbubbles,1.1.0,210 kB\nglamour,1.1.0,88 kB\n' |
  gum table --return-column 1)
gum log --level info "Publishing" package "$PACKAGE"
