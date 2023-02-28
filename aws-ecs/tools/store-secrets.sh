#!/bin/bash

set -e

# TODO: let secrets manager create
JWT_KEY="$(openssl rand -hex 16)"
DB_PASSWORD="$(openssl rand -hex 16)"
SEC_KEY="$(openssl rand -hex 32)"
ENCLAVE_KEY="$(openssl rand -hex 32)"

if [ -z "$STEWARD_WALLET_KEY" ]; then
  echo "WARN: FINDY_AWS_ECS_STEWARD_WALLET_KEY missing, installing agency as non-steward"
fi

if [ -z "$STEWARD_DID" ]; then
  echo "WARN: FINDY_AWS_ECS_STEWARD_DID missing, installing agency as non-steward"
fi

if [ -z "$E2E_ORG_SEED" ]; then
  echo "WARN: E2E_ORG_SEED missing, should install agency with steward"
fi

if [ -z "$ADMIN_ID" ]; then
  echo "ERROR: ADMIN_ID missing, required"
  exit 1
fi

if [ -z "$ADMIN_AUTHN_KEY" ]; then
  echo "ERROR: ADMIN_AUTHN_KEY missing, required"
  exit 1
fi

params=(
  "\"findy-agency-steward-wallet-key\":\"$STEWARD_WALLET_KEY\""
  "\"findy-agency-steward-did\":\"$STEWARD_DID\""
  "\"findy-agency-steward-seed\":\"$STEWARD_SEED\""
  "\"findy-agency-db-password\":\"$DB_PASSWORD\""
  "\"findy-agency-jwt-key\":\"$JWT_KEY\""
  "\"findy-agency-admin-id\":\"$ADMIN_ID\""
  "\"findy-agency-admin-authn-key\":\"$ADMIN_AUTHN_KEY\""
  "\"findy-agency-sec-key\":\"$SEC_KEY\""
  "\"findy-agency-enclave-key\":\"$ENCLAVE_KEY\""
  "\"findy-agency-e2e-org-seed\":\"$E2E_ORG_SEED\""
)
joined=$(printf ",%s" "${params[@]}")
SECRET_STRING={${joined:1}}

echo "$SECRET_STRING"

aws secretsmanager create-secret --name "FindyAgency" --secret-string "$SECRET_STRING"

echo "Secrets stored in AWS. Use secrets manager to double-check values."
