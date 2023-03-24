#!/bin/bash

set -ex
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | tee /etc/apt/sources.list.d/google.list
apt-get update
apt-get install -y -qq google-chrome-stable
google-chrome --version
