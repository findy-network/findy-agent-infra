#!/bin/bash

TEMPLATE_PATH=$1
TARGET_PATH=$2
APP_URL=$3
API_URL=$4
API_PORT=$5

cp $TEMPLATE_PATH $TARGET_PATH

# replace auth server URL
sub_cmd='{gsub("http://localhost:8088","https://'$APP_URL'")}1'
awk "$sub_cmd" "$TARGET_PATH" >"./set-env.sh.tmp" && mv ./set-env.sh.tmp $TARGET_PATH

# replace auth origin URL
sub_cmd='{gsub("http://localhost:3000","https://'$APP_URL'")}1'
awk "$sub_cmd" "$TARGET_PATH" >"./set-env.sh.tmp" && mv ./set-env.sh.tmp $TARGET_PATH

# replace API server domain
sub_cmd='{gsub("localhost","'$API_URL'")}1'
awk "$sub_cmd" "$TARGET_PATH" >"./set-env.sh.tmp" && mv ./set-env.sh.tmp $TARGET_PATH

# replace API server port
sub_cmd='{gsub("50052","'$API_PORT'")}1'
awk "$sub_cmd" "$TARGET_PATH" >"./set-env.sh.tmp" && mv ./set-env.sh.tmp $TARGET_PATH
