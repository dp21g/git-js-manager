#!/bin/bash
# Auto-enter YubiKey PIN for git

PIN_FILE="$HOME/.yubikey-pin"
PIN=""

if [ -n "$GIT_SQUASH_YUBIKEY_PIN" ]; then
    PIN="$GIT_SQUASH_YUBIKEY_PIN"
elif [ -f "$PIN_FILE" ]; then
    PIN=$(cat "$PIN_FILE")
fi

if [ -n "$PIN" ]; then
    expect -f - "$PIN" "$@" << 'DONE'
set pin [lindex $argv 0]
set gitargs [lrange $argv 1 end]
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
