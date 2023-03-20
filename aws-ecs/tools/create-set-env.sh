#!/bin/bash

TEMPLATE_PATH=$1
APP_URL=$2
API_URL=$3
API_PORT=$4

cp $TEMPLATE_PATH ./build/set-env.sh

# replace auth server URL
sub_cmd='{sub("http://localhost:8088","https://'$APP_URL'")}1'
awk "$sub_cmd" "./build/set-env.sh" >"./set-env.sh.tmp" && mv ./set-env.sh.tmp ./build/set-env.sh

# replace auth origin URL
sub_cmd='{sub("http://localhost:3000","https://'$APP_URL'")}1'
awk "$sub_cmd" "./build/set-env.sh" >"./set-env.sh.tmp" && mv ./set-env.sh.tmp ./build/set-env.sh

# replace API server domain
sub_cmd='{sub("localhost","'$API_URL'")}1'
awk "$sub_cmd" "./build/set-env.sh" >"./set-env.sh.tmp" && mv ./set-env.sh.tmp ./build/set-env.sh

# replace API server port
sub_cmd='{sub("50052","'$API_PORT'")}1'
awk "$sub_cmd" "./build/set-env.sh" >"./set-env.sh.tmp" && mv ./set-env.sh.tmp ./build/set-env.sh

# insert cert dl command
dl_cert_cmd='  echo -n | openssl s_client -connect \"'$API_URL:$API_PORT'\" -servername \"'$API_URL:$API_PORT'\" | openssl x509 >./cert/server/server.crt'
awk_cmd='/^  export FCLI_TLS_PATH/ && !modif { printf("  rm ./cert/server/server.crt\n'$dl_cert_cmd'\n"); modif=1 } {print}'
awk "$awk_cmd" "./build/set-env.sh" >"./set-env.sh.tmp" && mv ./set-env.sh.tmp ./build/set-env.sh
