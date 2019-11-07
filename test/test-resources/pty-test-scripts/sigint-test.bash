#!/bin/bash

trap "echo 'sigint trapped'; exit 0" SIGINT

sleep 3
exit 1
