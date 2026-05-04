#!/bin/bash
# Sourced by other scripts to handle YubiKey PIN automation

git() {
    local pin_file="$HOME/.yubikey-pin"
    if [ -f "$pin_file" ]; then
        local pin=$(cat "$pin_file")
        # Use expect to automate PIN entry
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
