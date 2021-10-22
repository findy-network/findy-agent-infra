#!/bin/bash

set -e

# TODO: let secrets manager create
JWT_KEY="$(openssl rand -hex 16)"
ADMIN_ID="admin-$(openssl rand -hex 8)"
DB_PASSWORD="$(openssl rand -hex 16)"
SEC_KEY="$(openssl rand -hex 32)"
ENCLAVE_KEY="$(openssl rand -hex 32)"

if [ -z "$FINDY_AWS_ECS_STEWARD_WALLET_KEY" ]; then
  echo "ERROR: Define env variable FINDY_AWS_ECS_STEWARD_WALLET_KEY"
  exit 1
fi

if [ -z "$FINDY_AWS_ECS_STEWARD_DID" ]; then
  echo "ERROR: Define env variable FINDY_AWS_ECS_STEWARD_DID"
  exit 1
fi

if [ -z "$FINDY_AWS_ECS_CONFIG_SECRET_NAME" ]; then
  echo "ERROR: Define env variable FINDY_AWS_ECS_CONFIG_SECRET_NAME"
  exit 1
fi

if [ -n "$FINDY_AGENCY_JWT_KEY" ]; then
    JWT_KEY=$FINDY_AGENCY_JWT_KEY
fi

params=(
  "\"findy-agency-steward-wallet-key\":\"$FINDY_AWS_ECS_STEWARD_WALLET_KEY\""
  "\"findy-agency-steward-wallet-imported-key\":\"$FINDY_AWS_ECS_STEWARD_WALLET_KEY\""
  "\"findy-agency-steward-did\":\"$FINDY_AWS_ECS_STEWARD_DID\""
  "\"findy-agency-db-password\":\"$DB_PASSWORD\""
  "\"findy-agency-jwt-key\":\"$JWT_KEY\""
  "\"findy-agency-admin-id\":\"$ADMIN_ID\""
  "\"findy-agency-sec-key\":\"$SEC_KEY\""
  "\"findy-agency-enclave-key\":\"$ENCLAVE_KEY\""
)
joined=$(printf ",%s" "${params[@]}")
SECRET_STRING={${joined:1}}

echo "$SECRET_STRING"

docker run --rm -it \
    -e AWS_PAGER="" \
    -e AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION \
    -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY amazon/aws-cli \
    secretsmanager create-secret --name "$FINDY_AWS_ECS_CONFIG_SECRET_NAME" --secret-string "$SECRET_STRING"

echo "Secrets stored in AWS. Use secrets manager to double-check values."