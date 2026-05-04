#!/bin/bash
# Auto-enter YubiKey PIN for git
# Source: User prompt

PIN_FILE="$HOME/.yubikey-pin"

if [ -f "$PIN_FILE" ]; then
    PIN=$(cat "$PIN_FILE")
    expect -f - "$PIN" "$@" << 'DONE'
set pin [lindex $argv 0]
set gitargs [lrange $argv 1 end]
# Use full path to git to avoid recursion
spawn /usr/bin/git {*}$gitargs
expect {
    "Enter PIN for" {
        send "$pin\r"
        exp_continue
    }
    eof
}
DONE
else
    /usr/bin/git "$@"
fi
