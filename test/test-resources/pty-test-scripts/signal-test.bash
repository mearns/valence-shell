#!/bin/bash

trap "echo 'sigint trapped'; exit 0" SIGINT
trap "echo 'sigterm trapped'; exit 0" SIGTERM
# trap "echo 'sighup trapped'; exit 0" SIGHUP
# trap "echo 'sigquit trapped'; exit 0" SIGQUIT

while : ; do sleep 1 ; done
echo "Exiting normally"
exit 1
