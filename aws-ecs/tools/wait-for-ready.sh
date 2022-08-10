#!/bin/bash

getReadyStatus(){
    # TODO: use https
    local resCode=$(curl -s --write-out '%{http_code}' --output /dev/null http://$API_SUB_DOMAIN_NAME.$DOMAIN_NAME/ready)
    if (( ${resCode} == 200 )); then
        return 0
    else
        return 1
    fi
}


NOW=${SECONDS}
printf "Wait until agency is ready"
while ! getReadyStatus; do
    printf "."
    waitTime=$(($SECONDS - $NOW))
    if (( ${waitTime} >= 600 )); then
        printf "\nAgency failed to start.\n"
        exit 1
    fi
    sleep 1
done
