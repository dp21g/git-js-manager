#!/bin/bash
# Sourced by other scripts to handle YubiKey PIN automation

git() {
    local pin=""
    if [ -n "$GIT_SQUASH_YUBIKEY_PIN" ]; then
        pin="$GIT_SQUASH_YUBIKEY_PIN"
    elif [ -f "$HOME/.yubikey-pin" ]; then
        pin=$(cat "$HOME/.yubikey-pin")
    fi

    if [ -n "$pin" ]; then
        expect -c "
            set timeout 60
            spawn git $@
            expect {
                \"Enter PIN for\" {
                    send \"$pin\r\"
                    exp_continue
                }
                eof
            }
        "
    else
        command git "$@"
    fi
}

export -f git
