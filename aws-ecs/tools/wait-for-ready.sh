#!/bin/bash

getReadyStatus() {
  # TODO: use https
  local resCode=$(curl -s --write-out '%{http_code}' --output /dev/null http://$API_SUB_DOMAIN_NAME.$DOMAIN_NAME/ready)
  if ((${resCode} == 200)); then
    resCode=$(curl -s --write-out '%{http_code}' --output /dev/null https://$SUB_DOMAIN_NAME.$DOMAIN_NAME/login/begin/nonexistentuser)
    if ((${resCode} != 503)); then
      return 0
    fi
  else
    return 1
  fi
}

NOW=${SECONDS}
printf "Wait until agency is ready"
while ! getReadyStatus; do
  printf "."
  waitTime=$(($SECONDS - $NOW))
  if ((${waitTime} >= 1200)); then
    printf "\nAgency failed to start.\n"
    exit 1
  fi
  sleep 1
done
