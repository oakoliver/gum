# Render: node <vhs>/dist/cli.js assets/tapes/format.tape (from the repo root)
# Only the Screenshot is used; the GIF output is discarded.
Output assets/format.gif
Set Width 1080
Set Height 400
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

Type "gum format < examples/notes.md"
Enter
Sleep 1.5s
Type `gum format -t template '{{ Bold "Tasty" }} {{ Italic "Bubble" }} {{ Color "99" "0" " Gum " }}'`
Enter
Sleep 1.5s
Type "gum format -t emoji 'Shipped :rocket: with :heart:'"
Enter
Sleep 2s
Screenshot assets/format.png
