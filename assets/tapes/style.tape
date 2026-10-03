# Render: node <vhs>/dist/cli.js assets/tapes/style.tape (from the repo root)
# Only the Screenshot is used; the GIF output is discarded.
Output assets/style.gif
Set Width 760
Set Height 330
Set Shell bash
Set FontSize 16
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type `export PS1="> " PATH="$PWD/assets/tapes/bin:$PATH" && gum --version >/dev/null && clear`
Enter
Sleep 1.5s
Show

Type "bash examples/style.sh"
Enter
Sleep 2.5s
Screenshot assets/style.png
